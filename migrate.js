// Quick migration endpoint - will remove after use
const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// TEMPORARY MIGRATION ENDPOINT - REMOVE AFTER PHASE 1
app.get('/migrate-phase1', async (req, res) => {
  try {
    console.log('🔧 Running Phase 1 database enhancement...');
    
    // Read and execute enhancement SQL
    const sqlPath = path.join(__dirname, 'enhance-db.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await pool.query(sql);
    
    // Test the enhancement
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'customers' 
      ORDER BY ordinal_position;
    `);
    
    res.json({
      success: true,
      message: 'Phase 1 database enhancement completed',
      columns: result.rows,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Migration failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = app;
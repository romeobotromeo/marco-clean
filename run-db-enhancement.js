// Database Enhancement Runner - Phase 1
// Safely applies conversation system enhancements
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function enhanceDatabase() {
  console.log('🔧 Starting database enhancement for Phase 1...');
  
  try {
    // Read the enhancement SQL
    const sqlPath = path.join(__dirname, 'enhance-db.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📁 Enhancement SQL loaded');
    
    // Execute the enhancement
    await pool.query(sql);
    
    console.log('✅ Database enhancement completed successfully');
    console.log('📋 Added fields: business_name, services, conversation_state, style_preference, business_phone, site_url');
    console.log('🏃 Customers table now ready for sophisticated conversation tracking');
    
    // Test the enhancement
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'customers' 
      ORDER BY ordinal_position;
    `);
    
    console.log('\n📊 Current customers table structure:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} ${row.is_nullable === 'YES' ? '(nullable)' : '(required)'}`);
    });
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Database enhancement failed:', error);
    process.exit(1);
  }
}

enhanceDatabase();
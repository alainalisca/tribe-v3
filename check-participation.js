require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials!');
  console.log('URL:', supabaseUrl ? 'exists' : 'missing');
  console.log('Key:', supabaseKey ? 'exists' : 'missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkParticipation() {
  // Get Monica's user ID
  const { data: monica, error: monicaError } = await supabase
    .from('users')
    .select('id, email, name')
    .eq('email', 'alainalisco@aplusfitnessllc.com')
    .single();
  
  if (monicaError) {
    console.log('Monica not found:', monicaError);
    return;
  }

  console.log('Monica:', monica);

  // Get her participations
  const { data: participations, error: partError } = await supabase
    .from('session_participants')
    .select('*')
    .eq('user_id', monica.id);

  if (partError) {
    console.error('Error getting participations:', partError);
  } else {
    console.log('Monica participations:', participations);
  }
}

checkParticipation();

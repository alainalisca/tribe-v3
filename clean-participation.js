const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanParticipation() {
  // Get Monica's user ID
  const { data: monica } = await supabase
    .from('users')
    .select('id')
    .eq('email', 'alainalisco@aplusfitnessllc.com')
    .single();
  
  if (!monica) {
    console.log('Monica not found');
    return;
  }

  // Delete her participations
  const { error } = await supabase
    .from('session_participants')
    .delete()
    .eq('user_id', monica.id);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Cleaned up Monica participations');
  }
}

cleanParticipation();

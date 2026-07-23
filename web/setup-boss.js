require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setupBoss() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error("Usage: node web/setup-boss.js <email> <password>");
    process.exit(1);
  }

  console.log(`Setting up Boss account for: ${email}...`);

  // 1. Create or fetch the user in auth.users
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true
  });

  let userId;
  if (authError) {
    if (authError.code === 'email_exists' || authError.status === 422) {
      console.log("User already exists. Fetching user ID...");
      const { data: usersData, error: fetchError } = await supabase.auth.admin.listUsers();
      if (fetchError) throw fetchError;
      const user = usersData.users.find(u => u.email === email);
      if (!user) {
        console.error("Could not find existing user.");
        process.exit(1);
      }
      userId = user.id;
    } else {
      console.error("Error creating user:", authError);
      process.exit(1);
    }
  } else {
    userId = authData.user.id;
    console.log("Created new auth user.");
  }

  // 2. Ensure profile exists and set role to super_admin
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ 
      id: userId, 
      email: email, 
      role: 'super_admin' 
    });

  if (profileError) {
    console.error("Error updating profile:", profileError);
    process.exit(1);
  }

  console.log(`✅ Success! ${email} is now a super_admin.`);
}

setupBoss();

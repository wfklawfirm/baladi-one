# Adding a staff member (no passwords are stored in the repo)
1. Supabase Dashboard → Authentication → Users → Add user (email + password, auto-confirm).
2. Run in the SQL editor:
   insert into staff_member (user_id, municipality_id, role, display_name)
   select '<USER_UUID>', id, 'staff', '<name>' from municipality where slug = '<municipality-slug>';
3. The user signs in at /staff. Roles: staff (handle requests), mayor/admin (also read audit log).

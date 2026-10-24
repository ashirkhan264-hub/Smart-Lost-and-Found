Smart Lost & Found

The application uses SQL Server through the Node.js/Express API. Reports,
claims, admin actions, statistics, and match suggestions are read from the
database; the browser keeps the signed-in email and display details in its
local session.

Setup
1. Run schema.sql in SQL Server Management Studio or sqlcmd. It creates the
   lostfound_db database and the users, items, and claims tables if missing.
2. Check the SQL Server connection settings in db.js and update them for your
   local SQL Server account.
3. Install dependencies with `npm install`, then start the API with `npm start`.
4. Serve this folder in another terminal, for example with
   `python -m http.server 8080`, and open http://localhost:8080/login.html.
5. Register an account. To grant admin access, run this in lostfound_db:
   `UPDATE dbo.users SET role='admin' WHERE email='your-email@example.com';`
   Then sign out and sign back in.

The API listens on http://localhost:5000 by default. Set the PORT environment
variable to use another port. Keep the API running while using the frontend.
The login page and API require a SQL Server connection.

On My Matches, approved lost/found reports are compared by their details.
Claiming a found report from a match links it to your lost report. Submitting a
claim leaves the reports visible for admin review. When an admin approves a
linked Lost/Found match claim, both reports are marked returned and removed
from active listings. Item cards on Home and Search use the same claim request
flow.

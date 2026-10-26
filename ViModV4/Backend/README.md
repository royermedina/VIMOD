# ViMod Backend

For local frontend testing, serve the workspace root with Live Server on port 5500 and open the shared sign-in page: `http://localhost:5500/Backend/Nucleo/Frontend/Vistas/2.%20Inicio%20de%20sesion.html`. `FRONTEND_URL` remains the origin only (`http://localhost:5500`).

## Accounts and administration

Public registration supports `cliente`, `arquitecto`, and `constructora`. The selected type is persisted in MongoDB as `rol`, `requestedRole`, and `accountType`. For architects and contractors the account remains `pendiente`, so the server resolves its effective role as `cliente` and denies professional routes until an administrator approves it. `admin` is never accepted as a public role. Private routes always authenticate the JWT and resolve the effective role from the MongoDB user document or trusted server configuration.

### Administrative sign-in

The administrative username is `RoyeryAngel`. The backend provisions this account at startup when `ADMIN_PASSWORD` is present in its process environment. It stores only a bcrypt hash in MongoDB; when the configured account already exists as an active administrator, startup updates its hash to match the configured password without creating a duplicate account. Do not add an actual password to `.env`, source control, frontend files, command-line arguments, or logs. For local use, enter the password at a hidden PowerShell prompt, put it into the environment for the backend process, and start the server in that same shell:

```powershell
$secure = Read-Host "Enter the administrative password" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
Set-Location "C:\Users\Royer Medina\Desktop\ViModV4\Backend"
node src\server.js
```

The account is provisioned idempotently by the backend; no setup page, one-time secret, or setup endpoint is involved. If the configured username already belongs to a non-admin account, startup fails rather than elevating it. To remove the secret from the process after shutting down, run:

```powershell
Remove-Variable secure
$env:ADMIN_PASSWORD = $null
```

Serve the project using the existing frontend setup and open `Backend/Paquetes/Presentacion/PanelAdmin/Vistas/14. Acceso administrativo.html` (for example, `http://localhost:5500/Backend/Paquetes/Presentacion/PanelAdmin/Vistas/14.%20Acceso%20administrativo.html`). Enter username `RoyeryAngel` and the configured password. The form uses the shared `POST /api/auth/login`; the frontend redirects only if the response reports `rol: admin`. Backend middleware independently reloads the user from MongoDB for `/api/admin/*`, and direct console visits validate `/api/auth/me` before revealing the page. Ordinary client, architect, and contractor credentials cannot access administrative routes.

Administrators cannot be disabled through the user status endpoint, protecting the administrative account. The former `POST /api/auth/admin/setup` endpoint and `ADMIN_SECRET` bootstrap flow have been removed.

`GET /api/admin/overview`, `/users`, `/role-requests`, `/projects`, `/orders`, `/reviews`, `/services`, `/quotes`, `/payments`, and `/audit` are administrator-only. Approvals and rejections, review assignment, and account status changes are recorded in `adminAudit`. User list responses omit password hashes and tokens.

## Client project management

- `PATCH /api/projects/:id` updates a client's draft project after validating its name, owner-owned terrain, positive COP budget, 1–6 whole bedrooms, and 1–6 whole bathrooms. Input changes mark a saved analysis stale until the next analysis; selected proposals and review, quote, or order activity prevent editing.
- `DELETE /api/projects/:id` removes only a draft with no linked analysis, proposal, review, observation, quote, or order. Otherwise it returns `409` and the client can use `PATCH /api/projects/:id/archive` to preserve the project and its related records.
- `DELETE /api/terrains/:id` removes an owner-owned terrain only when it has no active projects. Closed and archived projects do not block removal; active project names are returned with `409`.
- Bathroom counts are numeric values in the project document and API response; for example, `2` remains `2` from the client form through MongoDB and project reads.

### Trusted legacy role assignments

For accounts authorized outside the approval flow, an administrator obtains that user's MongoDB `_id` and configures a server-only `ROLE_ASSIGNMENTS` entry:

```text
ROLE_ASSIGNMENTS=<existing-user-object-id>=arquitecto;<another-user-object-id>=constructora
```

Each ID must identify an existing document in `vimod.users`. Accepted roles are `arquitecto`, `constructora`, and `admin`. The server applies assignments after authenticating the JWT and loading the user from MongoDB. This does not rewrite user documents. Restart the backend after changing an assignment. Never expose administrative environment values to the browser.

To inspect an existing account ID using an authorized MongoDB shell:

```javascript
use vimod
db.users.find({ correo: "person@example.com" }, { _id: 1, nombre: 1, correo: 1, rol: 1 })
```

## Checks

Run the static check with `npm.cmd run check`. Run integration tests with `npm.cmd test` while the dedicated MongoDB server is available on `127.0.0.1:27021`. Tests use a uniquely named `vimod_stage1_test_*` database and drop only that database after the run; they do not use or clear `vimod`.

Stage 2 tests additionally use a uniquely named `vimod_stage2_test_*` database and drop only that test database after their run.

Stage 3 tests use a uniquely named `vimod_stage3_test_*` database. They exercise CORS, public account roles, configured administrator provisioning and authentication, approval decisions, HU-08 to HU-12 authorization/persistence, quote/order idempotency, and rejection of unverified payment confirmations. They drop only their isolated test database.

Stage 5 Stripe tests use a uniquely named `vimod_stage5_stripe_test_*` database and a mocked Stripe client. They do not call Stripe or use the `vimod` database.

## Persistent project workflows and payment readiness

- `POST /api/projects/:id/select-proposal` and `GET /api/projects/:id/selected-proposal` save and retrieve an owner-checked selection in the MongoDB project document.
- `POST /api/projects/:id/reviews`, `GET /api/projects/:id/reviews`, `GET /api/architect/reviews`, and `POST /api/reviews/:id/observations` implement assigned reviews with duplicate prevention and owner/architect authorization. Review assignment is available to administrators through `PATCH /api/admin/reviews/:id/assign`.
- `GET /api/services` lists active published services. Authorized contractors manage their own records through `/api/contractor/services`.
- Clients create and query quotes under `/api/projects/:id/quotes`; contractors query and respond under `/api/contractor/quotes`.
- Orders use a selected project proposal or a responded contractor quote, persist separately from payment status, and require an `Idempotency-Key`. `POST /api/orders/:id/payment-session` creates the configured payment session using the saved order amount. `GET /api/payments` returns the authenticated client's history. Client-supplied confirmation through the legacy `/confirm` route remains rejected.

## Checkout and internal payment simulation

The internal academic payment simulator remains the fallback. It displays the order, COP amount, simulated method, selected result, and a clear no-charge disclaimer; attempts are stored in the shared `payments` collection with `simulated: true`.

Set `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY` to a test key beginning with `sk_test_`, `COP_PER_USD` to a positive COP-per-USD exchange rate, and `FRONTEND_URL` to the frontend origin (for example, `http://localhost:5500`) to use Stripe Checkout. If Stripe is not selected or its key is missing, ViMod uses the internal simulator. A live key is rejected. Never expose or log the secret key.

The backend converts the stored COP total to USD cents using `round(amountCOP / COP_PER_USD * 100)`; no amount from the browser is used. Stripe payment records remain in `payments` and include the session ID, COP/USD amounts, exchange rate, provider, and status. `POST /api/payments/stripe/confirm` retrieves and verifies the Stripe session and its metadata before marking an order paid. `POST /api/orders/:id/payment-cancel` records an authenticated checkout cancellation. Test cards: `4242 4242 4242 4242` succeeds and `4000 0000 0000 0002` is declined. Never use live card data in test mode.

When Stripe is not configured, supported simulator methods are `test_card`, `simulated_transfer`, and `test_balance`; results are `approved`, `declined`, `cancelled`, and `pending`. No card number, CVV, or real financial credential is accepted or stored by the simulator.

## Preliminary analysis and academic proposal catalog

The project endpoints provide:

- `POST /api/projects/:id/analyze` and `GET /api/projects/:id/analysis`.
- `POST /api/projects/:id/proposals` and `GET /api/projects/:id/proposals`.
- `POST /api/projects/:id/proposals/regenerate` to explicitly recalculate the same deterministic generation.
- `GET /api/projects/:id/proposals/:proposalId` for an owner-checked proposal and its stored estimate.

All are protected by JWT, loaded user, and the `cliente` role; the service additionally queries the project and its terrain using the authenticated owner's ObjectId. Analysis is stored in `projectAnalyses`. Proposals are stored in `proposals`; each proposal embeds the estimate and its parameters, avoiding a second write that could diverge on the standalone MongoDB deployment.

Initial academic assumptions are centralized in `src/config/modular-catalog.js`: equal-footprint modules are 6x4 m (24 m2), one common module is required, each bedroom module accommodates up to 2 bedrooms, and each wet-core module up to 2 bathrooms. Indicative COP costs are 45,000,000 per common module, 58,000,000 per bedroom module, and 72,000,000 per wet-core module (approximately COP 1.9–3.0 million/m2). These are academic assumptions, not market quotations. Annual energy assumptions are 900, 450, and 300 kWh/year respectively. Execution time is modeled as 10 setup days plus 4 sequential days per module. These values are estimates for coursework, not professional soil studies or guaranteed commercial quotes.

The proposal contains the modules required by the room/bath capacities. The layout is accepted only if rows and columns of 6x4 m modules (including rotated orientation) fit within the entered terrain dimensions. The catalog models rectangular module grids only; it does not currently support named typologies such as L-shaped or duplex distributions. Repeating generation with unchanged inputs upserts by project, input fingerprint, and option code; it does not create duplicates. A catalog-version change recalculates proposals using the new COP assumptions. Previously stored amounts are not converted.

## Demo contractor accounts

The seed creates six approved contractor accounts and their sample services/materials. Each record is marked `demo: true` and the operation is idempotent. Run these commands from `Backend`; provide a password of at least eight characters through the hidden prompt. The password is hashed using the same bcrypt cost as registration and is never stored in source files:

```powershell
$env:DEMO_MONGODB_DATABASE = "vimod_demo_20261025"
$secure = Read-Host "Contraseña común para las constructoras demo" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:DEMO_SEED_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  node scripts\seed-demo-constructoras.js
  if ($LASTEXITCODE -ne 0) { throw "Falló la carga de constructoras demo." }
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable secure
  $env:DEMO_SEED_PASSWORD = $null
  $env:DEMO_MONGODB_DATABASE = $null
}
```

To remove only the accounts and publications created by this script, set the same `DEMO_MONGODB_DATABASE` and run `node scripts\seed-demo-constructoras.js --remove` from `Backend`. It does not delete records that are not marked as demo data from this seed.

## Demo architects and client projects

The isolated platform seed creates four approved architect profiles, one client account, and four draft projects with linked terrains. It uses a separate source marker (`vimod-demo-platform-v1`) and is idempotent. The script requires an explicit database name beginning with `vimod_demo_` or `vimod_stage`; it refuses to run against `vimod`.

From `Backend`, set a private password and isolated database before running it:

```powershell
$env:DEMO_MONGODB_DATABASE = "vimod_demo_20261025"
$secure = Read-Host "Contraseña común para la plataforma demo" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:DEMO_SEED_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  node scripts\seed-demo-platform.js
  if ($LASTEXITCODE -ne 0) { throw "Falló la carga de la plataforma demo." }
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable secure
  $env:DEMO_SEED_PASSWORD = $null
  $env:DEMO_MONGODB_DATABASE = $null
}
```

Use the same database override when starting the backend for the demonstration. To remove only this seed, set `DEMO_MONGODB_DATABASE` again and run `node scripts\seed-demo-platform.js --remove`.

# Indonor HR, Recruitment & Employee Management CRM

Production-oriented monorepo for the internal HR platform described in the CRM specification.

## Applications

- `backend` — Express/Mongoose REST API with JWT access tokens, rotating refresh tokens, RBAC, validation, audit logging, soft deletion, dashboard aggregation, and scheduled notifications.
- `admin` — React/Vite/MUI responsive CRM application with protected routes, dashboard, employees, recruitment, interviews, website enquiries, and administration screens.

## Quick start

1. Start MongoDB.
2. Copy `backend/.env.example` to `backend/.env` and set secrets.
   To use Cloudinary for private documents, set `FILE_STORAGE_PROVIDER=cloudinary` and provide `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`. Uploads use authenticated raw assets and are never exposed as public URLs. Until those values are supplied, development uses the private local fallback.
3. Copy `admin/.env.example` to `admin/.env` and set the deployment URLs.
   Development always uses `VITE_LOCAL_APP_URL`; every other Vite mode uses `VITE_SERVER_APP_URL`.
4. Install dependencies:

   ```sh
   cd backend && npm install
   cd ../admin && npm install
   ```

5. Seed development roles and the optional administrator:

   ```sh
   cd backend
   npm run seed
   ```

6. Run both applications in separate terminals:

   ```sh
   cd backend && npm run dev
   cd admin && npm run dev
   ```

The API is available at `http://localhost:5000/api/v1` and Swagger UI at `http://localhost:5000/api-docs`.

Backend selects `LOCAL_APP_URL`/`LOCAL_ADMIN_URL` in development and `SERVER_APP_URL`/`SERVER_ADMIN_URL` in every other environment. CORS is additionally allowlisted from the comma-separated `CORS_ALLOWED_ORIGINS` value; unknown origins are rejected.

## Website contact enquiries

The `indonortech` website forwards `POST /api/contact` to the CRM backend using `CRM_LOCAL_API_URL` in development and `CRM_SERVER_API_URL` in other environments. The backend stores submissions in `contact_submissions`; authenticated users with `contact:read` can view them at `GET /api/v1/contact-submissions`, and users with `contact:update` can update their status. Configure the website variables from `indonortech/.env.example` and ensure both applications use the same CRM MongoDB connection.

## Admin email

The protected `/email` admin section sends messages through Zoho SMTP. Configure `SMTP_HOST` for the Zoho region used by the mailbox (`smtp.zoho.com`, `smtp.zoho.eu`, or `smtp.zoho.in`), port `465`, the mailbox address, and a Zoho app-specific password. The API accepts multiple To/CC recipients and up to five PDF/image attachments; credentials never reach the browser. Sent message metadata is retained in `EmailLog`.

Employees and candidates can have any number of documents. Upload through `POST /api/v1/documents/Employee/:employeeId` (multipart field `file`, plus optional `type` and `expiryDate`) and retrieve metadata through the matching authorized `GET` endpoint.

## Architecture

Backend modules follow `route -> controller -> service -> model` boundaries. Cross-cutting concerns live in `middleware`, `services`, and `utils`. IDs are allocated by the database-backed counter service, never by the browser. HR records use soft deletion and append-only timeline events.

The main aggregates are:

`User -> Candidate -> Interview -> Employee -> OnboardingTask`

Employees and candidates own education, experience, skills, documents, history, and (for employees) salary history. A candidate conversion creates an employee while retaining the candidate and all recruitment history.

## Important API groups

`/auth`, `/employees`, `/candidates`, `/interviews`, `/departments`, `/designations`, `/technologies`, `/onboarding`, `/notifications`, `/contact-submissions`, `/dashboard`, `/reports`, and `/audit-logs`.

Every response uses:

```json
{ "success": true, "message": "...", "data": {}, "meta": {} }
```

Sensitive salary endpoints require `salary:read` or `salary:update`; frontend visibility is not used as authorization.

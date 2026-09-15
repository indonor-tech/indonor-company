# Architecture and delivery plan

## Boundaries

The admin application is a separate deployable React/Vite app. The backend exposes only versioned REST resources. Route handlers authenticate and validate input, controllers/services own business rules, and Mongoose models persist data. Private files are stored outside the public web root and are returned only through authorized application endpoints.

## Relationship design

```text
User ──< AuditLog
User ──< Interview (interviewer/createdBy)
Candidate ──< Interview ──< feedbackHistory
Candidate ──< History
Candidate ──  Employee (candidateId, conversion keeps candidate)
Employee ──< History
Employee ──< SalaryHistory
Employee ──  Onboarding ──< onboarding.tasks
Employee/Candidate ──< Document
Employee ── Department / Designation
Employee ──< skills, education, experience
```

Registration identifiers are allocated by the `counters` collection with an atomic `$inc`, are unique-indexed on their aggregate, and are never derived from client input.

## Role and permission policy

| Role | Intended access |
| --- | --- |
| `SUPER_ADMIN` | All resources, users, roles, salary, audit |
| `HR_ADMIN` | Full HR operations, including salary and documents |
| `HR_MANAGER` | Employee/candidate/interview operations and reports |
| `RECRUITER` | Candidates, interviews, recruitment history |
| `MANAGER` | Read employees/candidates/interviews and provide interview feedback |
| `VIEWER` | Read-only access explicitly granted by permissions |

The API checks permissions for every protected route. Salary is intentionally omitted from employee list/profile responses and has a separate permission-gated history endpoint.

## API groups

- `/auth`: login, refresh rotation, logout, current user, change password
- `/employees`: paginated search, profile update, soft delete/restore, salary, timeline
- `/candidates`: paginated pipeline, registration, status history, conversion, soft delete/restore, timeline
- `/interviews`: schedule, reschedule/update, feedback history
- `/catalog`: departments, designations, technologies
- `/onboarding`: checklist creation and task updates
- `/documents`: authorized metadata, private upload, archive
- `/dashboard` and `/reports`: aggregate workforce/recruitment metrics
- `/notifications`, `/audit-logs`, `/users`

## Delivery phases

1. Setup, security middleware, database connection and API envelope
2. Users, permissions, login history foundation and seed data
3. Employee aggregate, profile data, IDs, soft delete and timeline
4. Candidate aggregate and recruitment pipeline
5. Interviews and append-only feedback
6. Follow-up calculation and idempotent notification jobs
7. Onboarding checklist
8. Private document storage
9. Salary history and restricted endpoints
10. Dashboard and reports
11. Admin UI, responsive layout, forms and TanStack Query
12. Audit log and operational hardening
13. CSV exports and extended reporting
14. Unit/integration/e2e testing
15. Deployment, managed MongoDB, object storage and email provider configuration

The current implementation establishes phases 1–12 foundations and the primary admin workflows; CSV export, email delivery, expanded calendar views, and full test coverage are isolated follow-on work for phases 13–15.

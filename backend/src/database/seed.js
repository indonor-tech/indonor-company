import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import User from '../modules/auth/user.model.js';
import { Department, Designation, Technology, Track } from '../modules/common/catalog.model.js';
import { ROLE_PERMISSIONS } from '../modules/auth/roles.js';

const permissions = ROLE_PERMISSIONS.ADMIN;
const departments = ['Engineering', 'Frontend', 'Backend', 'Mobile', 'DevOps', 'QA', 'HR', 'Finance', 'Sales', 'Marketing', 'Operations', 'Management'];
const designations = [
  'Intern', 'Junior Software Engineer', 'Software Engineer', 'Senior Software Engineer', 'Tech Lead', 'Engineering Manager',
  'HR Executive', 'HR Manager', 'Recruiter', 'Project Manager', 'Product Manager', 'Business Analyst', 'UI/UX Designer',
  'QA Engineer', 'DevOps Engineer', 'Data Analyst', 'Accountant', 'Sales Executive', 'Marketing Executive',
  'Customer Support', 'Operations Executive', 'Content Writer'
];
const tracks = ['Frontend', 'Backend', 'Full Stack', 'UI/UX', 'Python', 'Java', 'AI/ML', 'Data Science', 'Mobile', 'DevOps', 'QA', 'Cloud', 'Product', 'HR', 'Marketing', 'Sales', 'Operations', 'Content', 'Finance', 'Support'];
const technologies = ['JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'Express.js', 'MongoDB', 'PostgreSQL', 'Python', 'Django', 'Java', 'Spring Boot', 'AWS', 'Docker', 'Kubernetes', 'Flutter', 'React Native', 'QA', 'DevOps'];

await connectDatabase();
const password = process.env.SEED_ADMIN_PASSWORD;
if (password) {
  await User.findOneAndUpdate(
    { email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com' },
    { $set: { name: 'System Administrator', role: 'SUPER_ADMIN', permissions, isActive: true }, $setOnInsert: { passwordHash: await User.hashPassword(password) } },
    { upsert: true, new: true }
  );
}
for (const [Model, values] of [[Department, departments], [Designation, designations], [Technology, technologies], [Track, tracks]]) {
  await Model.bulkWrite(values.map((name) => ({ updateOne: { filter: { name }, update: { $setOnInsert: { name } }, upsert: true } })));
}
await disconnectDatabase();
console.log('Seed completed');

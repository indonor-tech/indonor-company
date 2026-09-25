import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import * as taskModels from '../src/modules/tasks/task.models.js';
import { Notification } from '../src/modules/common/support.model.js';

await connectDatabase();
const models = [...Object.values(taskModels).filter((model) => model?.prototype instanceof mongoose.Model), Notification];
for (const model of models) {
  await model.createIndexes();
  process.stdout.write(`Indexes ensured for ${model.modelName}\n`);
}
await disconnectDatabase();

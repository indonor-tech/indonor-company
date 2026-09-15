import { AppError } from '../utils/errors.js';

export const validate = (schema) => (req, _res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) return next(new AppError('Validation failed', 422, error.details.map((item) => ({ field: item.path.join('.'), message: item.message }))));
  req.body = value;
  return next();
};

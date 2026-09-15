export function sendSuccess(res, data, message = 'Success', meta = {}) {
  return res.json({ success: true, message, data, meta });
}

export function pagination(page, limit, total) {
  return {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    hasNext: page * limit < total
  };
}

const { z } = require('zod');
const mongoose = require('mongoose');

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Некоректний ідентифікатор');

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues[0]?.message || 'Некоректні дані' });
    }
    req[source] = result.data;
    return next();
  };
}

function validateIdParam(name = 'id') {
  return (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params[name])) {
      return res.status(400).json({ error: 'Некоректний ідентифікатор' });
    }
    return next();
  };
}

module.exports = { z, objectId, validate, validateIdParam };

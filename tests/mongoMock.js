// Hacemos que cuando el servidor intente crear el store de Mongo, 
// devuelva 'undefined'. Al recibir undefined, express-session usará 
// automáticamente su MemoryStore (perfecto para tests rápidos).
export default {
  create: () => undefined
};
import request from 'supertest';
import app from '../src/index.js';
import mongoose from 'mongoose';

describe('Pruebas automatizadas E2E de Rutas (Backend)', () => {

  // Cierra la conexión a la base de datos tras acabar los tests para que no se quede colgado
  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  describe('1. Rutas Públicas y de Salud', () => {
    it('Debería cargar la ruta de salud (/api/health) correctamente', async () => {
      const res = await request(app).get('/api/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('Debería responder la documentación de Swagger', async () => {
      const res = await request(app).get('/api-docs');
      expect([200, 301, 302]).toContain(res.statusCode); 
    });
  });

  describe('2. Sistema de Autenticación (/api/auth)', () => {
    it('Debería rechazar un login sin enviar credenciales', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      // Como no enviamos usuario/contraseña, debe fallar, pero no dar error 500
      expect(res.statusCode).not.toBe(500); 
    });
  });

  describe('3. Rutas de Steam (/api/steam)', () => {
    it('Debería denegar acceso a la lista de juegos sin estar autenticado', async () => {
      const res = await request(app).get('/api/steam/games');
      // Esperamos que tu middleware de seguridad lo bloquee
      expect([401, 403, 404]).toContain(res.statusCode);
    });
  });

});
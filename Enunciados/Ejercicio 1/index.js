const express = require('express');
const { body, validationResult } = require('express-validator');
const mysql = require('mysql2/promise'); // Requerimos la librería

const app = express();
app.use(express.json()); 

// Configuración de la base de datos
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'admin783',
  database: 'tp2_backend'
};


//Crear un nuevo rectángulo

app.post('/rectangulos', 
  [
    body('lado_a')
      .exists().withMessage('El lado A es obligatorio')
      .isNumeric().withMessage('El lado A debe ser un número')
      .custom(value => value > 0).withMessage('El lado A debe ser mayor que cero'),
      
    body('lado_b')
      .exists().withMessage('El lado B es obligatorio')
      .isNumeric().withMessage('El lado B debe ser un número')
      .custom(value => value > 0).withMessage('El lado B debe ser mayor que cero')
  ], 
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errores: errors.array() });
    }

    const lado_a = parseFloat(req.body.lado_a);
    const lado_b = parseFloat(req.body.lado_b);
    const perimetro = 2 * (lado_a + lado_b);
    const superficie = lado_a * lado_b;

    try {
      //Conectar, insertar y cerrar conexión
      const connection = await mysql.createConnection(dbConfig);
      
      const [resultado] = await connection.execute(
        'INSERT INTO rectangulos (lado_a, lado_b, perimetro, superficie) VALUES (?, ?, ?, ?)',
        [lado_a, lado_b, perimetro, superficie]
      );
      
      await connection.end();

      //Responder con el ID generado en la base de datos
      res.status(201).json({
        mensaje: 'Rectángulo guardado en la base de datos',
        id: resultado.insertId,
        datos: { lado_a, lado_b, perimetro, superficie }
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({ mensaje: 'Error interno al guardar en la base de datos' });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
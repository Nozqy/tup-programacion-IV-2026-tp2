const express = require('express');
const mysql = require('mysql2/promise');
const { body, validationResult } = require('express-validator');

const app = express();
app.use(express.json());

// Configuración de la base de datos
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'admin783',
  database: 'tp2_backend'
};


// Crear una nueva tarea

app.post('/tareas', 
  [
    body('nombre')
      .trim() // Elimina espacios al principio y al final
      .notEmpty().withMessage('El nombre de la tarea es obligatorio')
      .isString().withMessage('El nombre debe ser un texto válido')
      .custom(async (value) => {
        // Criterio de comparación: pasamos todo a minúsculas
        const connection = await mysql.createConnection(dbConfig);
        // Usamos LOWER en SQL para comparar sin importar mayúsculas/minúsculas
        const [rows] = await connection.execute(
          'SELECT id FROM tareas WHERE LOWER(nombre) = LOWER(?)', 
          [value]
        );
        await connection.end();

        if (rows.length > 0) {
          throw new Error('Ya existe una tarea con este nombre (ignorando mayúsculas y espacios)');
        }
        return true;
      }),
      
    body('estado')
      .optional() // El estado no es obligatorio al crear
      .isBoolean().withMessage('El estado debe ser un valor booleano (true o false)')
  ], 
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errores: errors.array() });
    }

    const { nombre, estado } = req.body;
    // Si no mandan estado, por defecto será false (0 en MySQL)
    const estadoFinal = estado === true ? 1 : 0; 

    try {
      const connection = await mysql.createConnection(dbConfig);
      const [resultado] = await connection.execute(
        'INSERT INTO tareas (nombre, estado) VALUES (?, ?)',
        [nombre, estadoFinal]
      );
      await connection.end();

      res.status(201).json({
        mensaje: 'Tarea creada correctamente',
        id: resultado.insertId,
        datos: { nombre, estado: estadoFinal === 1 }
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({ mensaje: 'Error interno al guardar en la base de datos' });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Servidor de tareas (Ejercicio 2) escuchando en el puerto ${PORT}`);
});
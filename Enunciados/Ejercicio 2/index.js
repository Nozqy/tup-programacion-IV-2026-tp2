const express = require('express');
const mysql = require('mysql2/promise');
const { body, query, validationResult } = require('express-validator');

const app = express();
app.use(express.json());

// Configuración de la base de datos
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_DATABASE
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

//Listar tareas

app.get('/tareas', 
  [
    query('estado')
      .optional()
      .isIn(['completada', 'pendiente'])
      .withMessage('El filtro de estado solo admite "completada" o "pendiente"')
  ], 
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errores: errors.array() });
    }

    const { estado } = req.query;
    
    // Armamos la consulta SQL base
    let sql = 'SELECT * FROM tareas';
    
    // Si envían un filtro, modificamos la consulta SQL
    if (estado === 'completada') {
      sql += ' WHERE estado = 1';
    } else if (estado === 'pendiente') {
      sql += ' WHERE estado = 0';
    }

    try {
      const connection = await mysql.createConnection(dbConfig);
      const [rows] = await connection.execute(sql);
      await connection.end();

      // Transformamos el estado (0 o 1) a booleano (false o true) 
      const tareasFormateadas = rows.map(tarea => ({
        id: tarea.id,
        nombre: tarea.nombre,
        estado: tarea.estado === 1
      }));

      res.status(200).json(tareasFormateadas);

    } catch (error) {
      console.error(error);
      res.status(500).json({ mensaje: 'Error interno al consultar la base de datos' });
    }
});

// Modificar una tarea existente

app.put('/tareas/:id', 
  [
    body('nombre')
      .optional()
      .trim()
      .notEmpty().withMessage('El nombre no puede estar vacío')
      .isString().withMessage('El nombre debe ser un texto')
      .custom(async (value, { req }) => {
        const id = req.params.id;
        const connection = await mysql.createConnection(dbConfig);
        // Buscamos si existe otra tarea con ese nombre, EXCLUYENDO el ID actual
        const [rows] = await connection.execute(
          'SELECT id FROM tareas WHERE LOWER(nombre) = LOWER(?) AND id != ?', 
          [value, id]
        );
        await connection.end();

        if (rows.length > 0) {
          throw new Error('Ya existe otra tarea con este nombre');
        }
        return true;
      }),
      
    body('estado')
      .optional()
      .isBoolean().withMessage('El estado debe ser un valor booleano (true o false)')
  ], 
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errores: errors.array() });
    }

    const id = req.params.id;
    const { nombre, estado } = req.body;

    // Validamos que envíen al menos un dato para actualizar
    if (nombre === undefined && estado === undefined) {
      return res.status(400).json({ mensaje: 'Debe proporcionar un nombre o un estado para modificar' });
    }

    try {
      const connection = await mysql.createConnection(dbConfig);
      
      // Primero buscamos la tarea actual
      const [tareasExistentes] = await connection.execute('SELECT * FROM tareas WHERE id = ?', [id]);
      
      if (tareasExistentes.length === 0) {
        await connection.end();
        return res.status(404).json({ mensaje: 'Tarea no encontrada' });
      }

      const tareaActual = tareasExistentes[0];
      
      // Si enviaron un dato nuevo, lo usamos.
      const nombreFinal = nombre !== undefined ? nombre : tareaActual.nombre;
      let estadoFinal = tareaActual.estado;
      if (estado !== undefined) {
        estadoFinal = estado === true ? 1 : 0;
      }

      // Ejecutamos la actualización
      await connection.execute(
        'UPDATE tareas SET nombre = ?, estado = ? WHERE id = ?',
        [nombreFinal, estadoFinal, id]
      );
      
      await connection.end();

      res.status(200).json({
        mensaje: 'Tarea actualizada correctamente',
        datos: {
          id: parseInt(id),
          nombre: nombreFinal,
          estado: estadoFinal === 1
        }
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({ mensaje: 'Error interno al actualizar la base de datos' });
    }
});

//Eliminar una tarea por ID

app.delete('/tareas/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const connection = await mysql.createConnection(dbConfig);
    const [resultado] = await connection.execute('DELETE FROM tareas WHERE id = ?', [id]);
    await connection.end();

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'Tarea no encontrada' });
    }

    res.status(200).json({ 
      mensaje: 'Tarea eliminada correctamente', 
      id_eliminado: parseInt(id) 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error interno al intentar eliminar la tarea' });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Servidor de tareas (Ejercicio 2) escuchando en el puerto ${PORT}`);
});
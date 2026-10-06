const express = require('express');
const mysql = require('mysql2/promise');
const { body, validationResult } = require('express-validator');

const app = express();
app.use(express.json());

// Configuración de base de datos
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_DATABASE
};

// Crear una nueva materia
app.post('/materias', 
  [
    body('nombre')
      .trim()
      .notEmpty().withMessage('El nombre de la materia es obligatorio')
      .isString().withMessage('El nombre debe ser un texto')
  ], 
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errores: errors.array() });
    }

    const { nombre } = req.body;

    try {
      const connection = await mysql.createConnection(dbConfig);
      const [resultado] = await connection.execute(
        'INSERT INTO materias (nombre) VALUES (?)',
        [nombre]
      );
      await connection.end();

      res.status(201).json({
        mensaje: 'Materia creada correctamente',
        id: resultado.insertId,
        nombre
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ mensaje: 'Error interno al guardar la materia' });
    }
});

// Listar todas las materias
app.get('/materias', async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT * FROM materias');
    await connection.end();

    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error interno al consultar las materias' });
  }
});


//Registrar nuevas calificaciones

app.post('/calificaciones', 
  [
    body('alumno_nombre')
      .trim()
      .notEmpty().withMessage('El nombre del alumno es obligatorio')
      .isString().withMessage('El nombre debe ser un texto'),
    
    body('materia_id')
      .notEmpty().withMessage('El ID de la materia es obligatorio')
      .isInt().withMessage('El ID de la materia debe ser un número entero')
      .custom(async (value, { req }) => {
        const connection = await mysql.createConnection(dbConfig);
        
        // Validar existencia de la materia (Integridad referencial)
        const [materia] = await connection.execute('SELECT id FROM materias WHERE id = ?', [value]);
        if (materia.length === 0) {
          await connection.end();
          throw new Error('La materia indicada no existe en el sistema');
        }

        //  Validar regla de unicidad (No repetir alumno y materia)
        const alumno = req.body.alumno_nombre;
        if (alumno) {
          const [registroExistente] = await connection.execute(
            'SELECT id FROM calificaciones WHERE LOWER(alumno_nombre) = LOWER(?) AND materia_id = ?',
            [alumno, value]
          );
          if (registroExistente.length > 0) {
            await connection.end();
            throw new Error('Este alumno ya tiene calificaciones registradas para esta materia');
          }
        }
        
        await connection.end();
        return true;
      }),

    body('nota1').isFloat({ min: 1, max: 10 }).withMessage('La nota 1 debe ser un número entre 1 y 10'),
    body('nota2').isFloat({ min: 1, max: 10 }).withMessage('La nota 2 debe ser un número entre 1 y 10'),
    body('nota3').isFloat({ min: 1, max: 10 }).withMessage('La nota 3 debe ser un número entre 1 y 10')
  ], 
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errores: errors.array() });
    }

    const { alumno_nombre, materia_id, nota1, nota2, nota3 } = req.body;

    try {
      const connection = await mysql.createConnection(dbConfig);
      const [resultado] = await connection.execute(
        'INSERT INTO calificaciones (alumno_nombre, materia_id, nota1, nota2, nota3) VALUES (?, ?, ?, ?, ?)',
        [alumno_nombre, materia_id, nota1, nota2, nota3]
      );
      await connection.end();

      res.status(201).json({
        mensaje: 'Calificaciones registradas correctamente',
        id: resultado.insertId,
        alumno_nombre,
        materia_id,
        notas: [nota1, nota2, nota3]
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ mensaje: 'Error interno al guardar las calificaciones' });
    }
});


//Listar todas las calificaciones

app.get('/calificaciones', async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig);
    
    // Consulta SQL con JOIN para obtener el nombre de la materia
    const sql = `
      SELECT 
        c.id, 
        c.alumno_nombre, 
        m.nombre AS materia_nombre, 
        c.nota1, 
        c.nota2, 
        c.nota3 
      FROM calificaciones c
      INNER JOIN materias m ON c.materia_id = m.id
    `;
    
    const [rows] = await connection.execute(sql);
    await connection.end();

    // Formatear los resultados para que las notas estén en un array
    const resultados = rows.map(fila => ({
      id: fila.id,
      alumno: fila.alumno_nombre,
      materia: fila.materia_nombre,
      notas: [parseFloat(fila.nota1), parseFloat(fila.nota2), parseFloat(fila.nota3)]
    }));

    res.status(200).json(resultados);

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error interno al consultar las calificaciones' });
  }
});

// Modificar calificaciones

app.put('/calificaciones/:id', 
  [
    body('alumno_nombre')
      .optional()
      .trim()
      .notEmpty().withMessage('El nombre no puede estar vacío')
      .isString().withMessage('El nombre debe ser un texto'),
    
    body('materia_id')
      .optional()
      .isInt().withMessage('El ID de la materia debe ser un número entero')
      .custom(async (value) => {
        const connection = await mysql.createConnection(dbConfig);
        const [materia] = await connection.execute('SELECT id FROM materias WHERE id = ?', [value]);
        await connection.end();
        
        if (materia.length === 0) {
          throw new Error('La materia indicada no existe en el sistema');
        }
        return true;
      }),

    body('nota1').optional().isFloat({ min: 1, max: 10 }).withMessage('La nota 1 debe estar entre 1 y 10'),
    body('nota2').optional().isFloat({ min: 1, max: 10 }).withMessage('La nota 2 debe estar entre 1 y 10'),
    body('nota3').optional().isFloat({ min: 1, max: 10 }).withMessage('La nota 3 debe estar entre 1 y 10')
  ], 
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errores: errors.array() });
    }

    const id = req.params.id;
    const { alumno_nombre, materia_id, nota1, nota2, nota3 } = req.body;

    if (alumno_nombre === undefined && materia_id === undefined && nota1 === undefined && nota2 === undefined && nota3 === undefined) {
      return res.status(400).json({ mensaje: 'Debe proporcionar al menos un dato para modificar' });
    }

    try {
      const connection = await mysql.createConnection(dbConfig);
      
      // Buscamos el registro actual para no perder datos si la actualización es parcial
      const [registroExistente] = await connection.execute('SELECT * FROM calificaciones WHERE id = ?', [id]);
      if (registroExistente.length === 0) {
        await connection.end();
        return res.status(404).json({ mensaje: 'Registro de calificaciones no encontrado' });
      }

      const actual = registroExistente[0];

      // Armamos los valores finales para la actualización, usando los valores existentes si no se proporcionan nuevos
      const finalAlumno = alumno_nombre !== undefined ? alumno_nombre : actual.alumno_nombre;
      const finalMateria = materia_id !== undefined ? materia_id : actual.materia_id;
      const finalNota1 = nota1 !== undefined ? nota1 : actual.nota1;
      const finalNota2 = nota2 !== undefined ? nota2 : actual.nota2;
      const finalNota3 = nota3 !== undefined ? nota3 : actual.nota3;

      // Validamos la unicidad: verificamos que la combinación final no pertenezca a OTRO ID distinto
      const [duplicados] = await connection.execute(
        'SELECT id FROM calificaciones WHERE LOWER(alumno_nombre) = LOWER(?) AND materia_id = ? AND id != ?',
        [finalAlumno, finalMateria, id]
      );
      
      if (duplicados.length > 0) {
        await connection.end();
        return res.status(400).json({ 
          errores: [{ msg: 'Modificación rechazada: El alumno ya tiene un registro distinto para esta materia' }] 
        });
      }

      // Ejecutamos la actualización
      await connection.execute(
        'UPDATE calificaciones SET alumno_nombre = ?, materia_id = ?, nota1 = ?, nota2 = ?, nota3 = ? WHERE id = ?',
        [finalAlumno, finalMateria, finalNota1, finalNota2, finalNota3, id]
      );
      
      await connection.end();

      res.status(200).json({
        mensaje: 'Calificaciones actualizadas correctamente',
        datos: {
          id: parseInt(id),
          alumno_nombre: finalAlumno,
          materia_id: finalMateria,
          notas: [parseFloat(finalNota1), parseFloat(finalNota2), parseFloat(finalNota3)]
        }
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({ mensaje: 'Error interno al actualizar las calificaciones' });
    }
});


// Eliminar un registro de calificaciones por ID

app.delete('/calificaciones/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const connection = await mysql.createConnection(dbConfig);
    const [resultado] = await connection.execute('DELETE FROM calificaciones WHERE id = ?', [id]);
    await connection.end();

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'Registro de calificaciones no encontrado' });
    }

    res.status(200).json({ 
      mensaje: 'Registro de calificaciones eliminado correctamente', 
      id_eliminado: parseInt(id) 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error interno al intentar eliminar el registro' });
  }
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`Servidor de calificaciones (Ejercicio 3) escuchando en el puerto ${PORT}`);
});
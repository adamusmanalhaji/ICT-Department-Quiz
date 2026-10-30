const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Store application data in DATA_DIR when set (e.g. Render's persistent disk).
// Otherwise, keep the database beside the project for local Windows use.
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const dbPath = path.join(dataDir, 'db.json');

function emptyDb() {
  return { users: [], courses: [], quizzes: [], attempts: [] };
}

function readDb() {
  if (!fs.existsSync(dbPath)) return emptyDb();
  try {
    const parsed = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      courses: Array.isArray(parsed.courses) ? parsed.courses : [],
      quizzes: Array.isArray(parsed.quizzes) ? parsed.quizzes : [],
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : []
    };
  } catch (error) {
    console.error('Could not read data/db.json:', error.message);
    throw new Error('The application data file is damaged. Restore data/db.json from a backup.');
  }
}

function writeDb(db) {
  fs.mkdirSync(dataDir, { recursive: true });
  const temporaryPath = `${dbPath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(temporaryPath, dbPath);
}

async function initializeStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = readDb();
  let changed = false;
  // Upgrade data created by earlier versions: build a course catalogue from existing quizzes.
  for (const quiz of db.quizzes) {
    let course = db.courses.find(item => item.department === (quiz.department || 'Information and Communication Technology (ICT)') && item.courseCode === String(quiz.courseCode || '').toUpperCase());
    if (!course && quiz.courseCode) {
      course = {
        id: `legacy-course-${quiz.id}`,
        courseCode: String(quiz.courseCode).toUpperCase(),
        courseTitle: quiz.courseTitle || String(quiz.courseCode).toUpperCase(),
        department: quiz.department || 'Information and Communication Technology (ICT)',
        createdBy: quiz.createdBy || null,
        active: true,
        createdAt: quiz.createdAt || new Date().toISOString()
      };
      db.courses.push(course);
      changed = true;
    }
    if (course && !quiz.courseId) {
      quiz.courseId = course.id;
      changed = true;
    }
  }
  if (changed) writeDb(db);
  if (db.users.length === 0) {
    const passwordHash = await bcrypt.hash('Admin123!', 12);
    db.users.push({
      id: 'admin-default',
      name: 'ICT System Administrator',
      email: 'admin@ict.local',
      passwordHash,
      role: 'admin',
      active: true,
      createdAt: new Date().toISOString()
    });
    writeDb(db);
    console.log('Created the first administrator account. Change its password after signing in.');
  }
}

module.exports = { readDb, writeDb, initializeStore };

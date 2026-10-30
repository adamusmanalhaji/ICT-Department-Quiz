require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const ExcelJS = require('exceljs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readDb, writeDb, initializeStore } = require('./store');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const uploadDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

app.disable('x-powered-by');
// Render and other reverse proxies terminate HTTPS before requests reach Express.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: 'ictquiz.sid',
  secret: process.env.SESSION_SECRET || 'local-development-secret-change-before-deployment',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

const id = () => crypto.randomUUID();
const clean = value => String(value ?? '').trim();
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const DEPARTMENTS = [
  'Information and Communication Technology (ICT)',
  'Computer Science',
  'Computer Engineering',
  'Software Engineering',
  'Cyber Security',
  'Information Systems'
];
const DEFAULT_DEPARTMENT = DEPARTMENTS[0];

function quizDepartment(quiz) {
  return clean(quiz.department) || DEFAULT_DEPARTMENT;
}

function publicUser(user) {
  return {
    id: user.id, name: user.name, email: user.email || '',
    matricNumber: user.matricNumber || '', department: user.department || '',
    role: user.role, active: user.active
  };
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please sign in to continue.' });
  const db = readDb();
  const user = db.users.find(item => item.id === req.session.userId && item.active);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Your account is unavailable. Contact the administrator.' });
  }
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

function lecturerOwnsQuiz(quiz, user) {
  return quiz && (user.role === 'admin' || quiz.createdBy === user.id);
}

function safeQuizForStudent(quiz) {
  return {
    id: quiz.id,
    title: quiz.title,
    courseId: quiz.courseId || '',
    courseCode: quiz.courseCode,
    courseTitle: quiz.courseTitle || quiz.courseCode,
    department: quizDepartment(quiz),
    durationMinutes: quiz.durationMinutes,
    questionCount: quiz.questions.length
  };
}

function safeQuestionForStudent(question) {
  return {
    id: question.id,
    question: question.question,
    options: question.options
  };
}

app.get('/api/catalog', (req, res) => {
  const db = readDb();
  const courses = db.courses
    .filter(course => course.active !== false)
    .map(course => ({
      id: course.id,
      courseCode: course.courseCode,
      courseTitle: course.courseTitle || course.courseCode,
      department: course.department
    }))
    .sort((a, b) => a.department.localeCompare(b.department) || a.courseCode.localeCompare(b.courseCode));
  res.json({ departments: DEPARTMENTS, courses });
});

app.post('/api/login', async (req, res) => {
  const role = clean(req.body.role);
  const password = String(req.body.password ?? '');
  const db = readDb();
  let user;
  let studentContext = null;

  if (role === 'student') {
    const matricNumber = clean(req.body.matricNumber).toUpperCase();
    const department = clean(req.body.department);
    const courseId = clean(req.body.courseId);
    const legacyCourseCode = clean(req.body.courseCode).toUpperCase();
    if (!matricNumber || !department || (!courseId && !legacyCourseCode) || !password) {
      return res.status(400).json({ error: 'Enter your matriculation number, password, department and select a course.' });
    }
    if (!DEPARTMENTS.includes(department)) return res.status(400).json({ error: 'Choose a valid department.' });
    const selectedCourse = db.courses.find(course => course.active !== false && (courseId ? course.id === courseId : course.courseCode.toUpperCase() === legacyCourseCode) && course.department === department);
    if (!selectedCourse) return res.status(400).json({ error: 'Select a course registered for your department. Ask a lecturer to add it if it is missing.' });
    user = db.users.find(item => item.role === 'student' && clean(item.matricNumber).toUpperCase() === matricNumber);
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'The matriculation number or password is incorrect.' });
    }
    if (clean(user.department) !== department) {
      return res.status(403).json({ error: 'The selected department does not match the department registered for your matriculation number. Contact the administrator.' });
    }
    studentContext = { department, courseId: selectedCourse.id, courseCode: selectedCourse.courseCode, courseTitle: selectedCourse.courseTitle || selectedCourse.courseCode };
  } else if (role === 'admin' || role === 'lecturer') {
    const email = clean(req.body.email).toLowerCase();
    if (!email || !password) return res.status(400).json({ error: 'Enter your email address and password.' });
    user = db.users.find(item => item.email && item.email.toLowerCase() === email && item.role === role);
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'The email or password is incorrect.' });
    }
  } else {
    return res.status(400).json({ error: 'Choose whether you are a Student, Lecturer or Administrator.' });
  }

  req.session.userId = user.id;
  req.session.studentContext = studentContext;
  res.json({ user: { ...publicUser(user), selectedCourseCode: studentContext?.courseCode || '', selectedCourseTitle: studentContext?.courseTitle || '' } });
});

app.post('/api/change-password', requireAuth, async (req, res) => {
  const currentPassword = String(req.body.currentPassword ?? '');
  const newPassword = String(req.body.newPassword ?? '');
  if (newPassword.length < 8) return res.status(400).json({ error: 'Your new password must contain at least 8 characters.' });
  if (!(await bcrypt.compare(currentPassword, req.user.passwordHash))) return res.status(400).json({ error: 'Your current password is incorrect.' });
  const db = readDb();
  const user = db.users.find(item => item.id === req.user.id);
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  writeDb(db);
  res.json({ message: 'Password updated successfully.' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(error => {
    if (error) return res.status(500).json({ error: 'Could not sign out. Please try again.' });
    res.clearCookie('ictquiz.sid');
    res.json({ message: 'Signed out successfully.' });
  });
});

app.get('/api/me', requireAuth, (req, res) => res.json({ user: { ...publicUser(req.user), selectedCourseCode: req.session.studentContext?.courseCode || '', selectedCourseTitle: req.session.studentContext?.courseTitle || '' } }));

// ADMIN: dashboard, account management, results and result publication.
app.get('/api/admin/overview', requireAuth, requireRole('admin'), (req, res) => {
  const db = readDb();
  const quizzes = db.quizzes.map(quiz => {
    const attempts = db.attempts.filter(attempt => attempt.quizId === quiz.id && attempt.status === 'submitted');
    const average = attempts.length
      ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.percentage, 0) / attempts.length)
      : 0;
    return {
      id: quiz.id,
      title: quiz.title,
      courseCode: quiz.courseCode,
      courseTitle: quiz.courseTitle || quiz.courseCode,
      department: quizDepartment(quiz),
      status: quiz.status,
      resultsPublished: Boolean(quiz.resultsPublished),
      questionCount: quiz.questions.length,
      attempts: attempts.length,
      average
    };
  });
  res.json({
    counts: {
      students: db.users.filter(user => user.role === 'student').length,
      lecturers: db.users.filter(user => user.role === 'lecturer').length,
      quizzes: db.quizzes.length,
      courses: db.courses.filter(course => course.active !== false).length,
      submissions: db.attempts.filter(attempt => attempt.status === 'submitted').length
    },
    quizzes
  });
});

app.get('/api/admin/users', requireAuth, requireRole('admin'), (req, res) => {
  const db = readDb();
  res.json({ users: db.users.map(publicUser) });
});

app.post('/api/admin/users', requireAuth, requireRole('admin'), async (req, res) => {
  const name = clean(req.body.name);
  const role = clean(req.body.role);
  const password = String(req.body.password ?? '');
  const email = clean(req.body.email).toLowerCase();
  const matricNumber = clean(req.body.matricNumber).toUpperCase();
  const department = clean(req.body.department);

  if (!name || password.length < 8 || !['lecturer', 'student'].includes(role)) {
    return res.status(400).json({ error: 'Enter a full name, password of at least 8 characters and choose Lecturer or Student.' });
  }
  if (role === 'lecturer' && !validEmail(email)) {
    return res.status(400).json({ error: 'Enter a valid lecturer email address.' });
  }
  if (role === 'student' && (!matricNumber || !DEPARTMENTS.includes(department))) {
    return res.status(400).json({ error: 'Enter the student matriculation number and select a valid department.' });
  }

  const db = readDb();
  if (role === 'lecturer' && db.users.some(user => user.email && user.email.toLowerCase() === email)) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }
  if (role === 'student' && db.users.some(user => user.role === 'student' && clean(user.matricNumber).toUpperCase() === matricNumber)) {
    return res.status(409).json({ error: 'A student account with that matriculation number already exists.' });
  }

  const user = {
    id: id(), name,
    ...(role === 'lecturer' ? { email } : { matricNumber, department }),
    passwordHash: await bcrypt.hash(password, 12),
    role, active: true,
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  writeDb(db);
  res.status(201).json({ user: publicUser(user), message: `${role === 'lecturer' ? 'Lecturer' : 'Student'} account created.` });
});

app.patch('/api/admin/users/:userId/status', requireAuth, requireRole('admin'), (req, res) => {
  const db = readDb();
  const user = db.users.find(item => item.id === req.params.userId);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  if (user.id === req.user.id) return res.status(400).json({ error: 'You cannot deactivate the account you are currently using.' });
  user.active = Boolean(req.body.active);
  writeDb(db);
  res.json({ user: publicUser(user) });
});

app.get('/api/admin/results', requireAuth, requireRole('admin'), (req, res) => {
  const db = readDb();
  const results = db.attempts
    .filter(attempt => attempt.status === 'submitted')
    .map(attempt => {
      const quiz = db.quizzes.find(item => item.id === attempt.quizId);
      const student = db.users.find(item => item.id === attempt.studentId);
      return {
        id: attempt.id,
        quizTitle: quiz ? quiz.title : 'Deleted quiz',
        courseCode: attempt.courseCode || (quiz ? quiz.courseCode : ''),
        department: attempt.department || (student ? student.department : '') || (quiz ? quizDepartment(quiz) : ''),
        studentName: student ? student.name : 'Unknown student',
        studentMatricNumber: student ? (student.matricNumber || '') : '',
        studentEmail: student ? (student.email || '') : '',
        score: attempt.score,
        total: attempt.total,
        percentage: attempt.percentage,
        submittedAt: attempt.submittedAt
      };
    })
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  res.json({ results });
});

app.patch('/api/admin/quizzes/:quizId/results', requireAuth, requireRole('admin'), (req, res) => {
  const db = readDb();
  const quiz = db.quizzes.find(item => item.id === req.params.quizId);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
  quiz.resultsPublished = Boolean(req.body.published);
  writeDb(db);
  res.json({ message: quiz.resultsPublished ? 'Results are now visible to students.' : 'Results have been hidden from students.' });
});

// LECTURERS: shared department course catalogue and quiz management.
app.get('/api/lecturer/courses', requireAuth, requireRole('lecturer'), (req, res) => {
  const db = readDb();
  const courses = db.courses
    .filter(course => course.active !== false)
    .map(course => ({
      id: course.id,
      courseCode: course.courseCode,
      courseTitle: course.courseTitle || course.courseCode,
      department: course.department,
      canManage: course.createdBy === req.user.id,
      quizCount: db.quizzes.filter(quiz => quiz.courseId === course.id).length
    }))
    .sort((a, b) => a.department.localeCompare(b.department) || a.courseCode.localeCompare(b.courseCode));
  res.json({ courses });
});

app.post('/api/lecturer/courses', requireAuth, requireRole('lecturer'), (req, res) => {
  const courseCode = clean(req.body.courseCode).toUpperCase();
  const courseTitle = clean(req.body.courseTitle);
  const department = clean(req.body.department);
  if (!courseCode || courseCode.length > 30 || !courseTitle || courseTitle.length > 120 || !DEPARTMENTS.includes(department)) {
    return res.status(400).json({ error: 'Enter a course code (maximum 30 characters), course title (maximum 120 characters) and valid department.' });
  }
  const db = readDb();
  if (db.courses.some(course => course.active !== false && course.department === department && course.courseCode.toUpperCase() === courseCode)) {
    return res.status(409).json({ error: 'That course code already exists in this department. Select it from the course list instead.' });
  }
  const course = {
    id: id(), courseCode, courseTitle, department,
    createdBy: req.user.id, active: true, createdAt: new Date().toISOString()
  };
  db.courses.push(course);
  writeDb(db);
  res.status(201).json({ course, message: 'Course added. It is now available in the student course selection list.' });
});

app.patch('/api/lecturer/courses/:courseId', requireAuth, requireRole('lecturer'), (req, res) => {
  const courseCode = clean(req.body.courseCode).toUpperCase();
  const courseTitle = clean(req.body.courseTitle);
  if (!courseCode || courseCode.length > 30 || !courseTitle || courseTitle.length > 120) {
    return res.status(400).json({ error: 'Enter a course code and a course title.' });
  }
  const db = readDb();
  const course = db.courses.find(item => item.id === req.params.courseId && item.createdBy === req.user.id && item.active !== false);
  if (!course) return res.status(404).json({ error: 'Course not found or you do not manage this course.' });
  if (db.courses.some(item => item.id !== course.id && item.active !== false && item.department === course.department && item.courseCode.toUpperCase() === courseCode)) {
    return res.status(409).json({ error: 'Another course already uses that code in this department.' });
  }
  const oldCode = course.courseCode;
  course.courseCode = courseCode;
  course.courseTitle = courseTitle;
  for (const quiz of db.quizzes.filter(item => item.courseId === course.id || (!item.courseId && item.department === course.department && item.courseCode === oldCode))) {
    quiz.courseId = course.id;
    quiz.courseCode = courseCode;
    quiz.courseTitle = courseTitle;
  }
  for (const attempt of db.attempts) {
    if (attempt.courseId === course.id || (!attempt.courseId && attempt.department === course.department && attempt.courseCode === oldCode)) {
      attempt.courseId = course.id;
      attempt.courseCode = courseCode;
    }
  }
  writeDb(db);
  res.json({ course, message: 'Course updated successfully.' });
});

app.delete('/api/lecturer/courses/:courseId', requireAuth, requireRole('lecturer'), (req, res) => {
  const db = readDb();
  const course = db.courses.find(item => item.id === req.params.courseId && item.createdBy === req.user.id && item.active !== false);
  if (!course) return res.status(404).json({ error: 'Course not found or you do not manage this course.' });
  const quizCount = db.quizzes.filter(quiz => quiz.courseId === course.id).length;
  if (quizCount) return res.status(400).json({ error: 'This course is linked to one or more quizzes and cannot be deleted. Edit it instead.' });
  course.active = false;
  writeDb(db);
  res.json({ message: 'Course removed from the active course list.' });
});

// LECTURERS: create quizzes, import question files and publish quizzes.
app.get('/api/lecturer/quizzes', requireAuth, requireRole('lecturer'), (req, res) => {
  const db = readDb();
  const quizzes = db.quizzes
    .filter(quiz => quiz.createdBy === req.user.id)
    .map(quiz => ({
      id: quiz.id,
      title: quiz.title,
      courseId: quiz.courseId || '',
      courseCode: quiz.courseCode,
      courseTitle: quiz.courseTitle || quiz.courseCode,
      department: quizDepartment(quiz),
      durationMinutes: quiz.durationMinutes,
      status: quiz.status,
      questionCount: quiz.questions.length
    }));
  res.json({ quizzes });
});

app.post('/api/lecturer/quizzes', requireAuth, requireRole('lecturer'), (req, res) => {
  const title = clean(req.body.title);
  const courseId = clean(req.body.courseId);
  const durationMinutes = Number(req.body.durationMinutes || 0);
  if (!title || !courseId || !Number.isInteger(durationMinutes) || durationMinutes < 0 || durationMinutes > 240) {
    return res.status(400).json({ error: 'Enter a quiz title, select a course and set a duration from 0 to 240 minutes. Use 0 for no time limit.' });
  }
  const db = readDb();
  const course = db.courses.find(item => item.id === courseId && item.active !== false);
  if (!course) return res.status(400).json({ error: 'Select a valid active course from the course catalogue.' });
  const { courseCode, courseTitle, department } = course;
  const quiz = {
    id: id(), title, courseId, courseCode, courseTitle, department, durationMinutes,
    createdBy: req.user.id,
    status: 'draft',
    resultsPublished: false,
    questions: [],
    createdAt: new Date().toISOString()
  };
  db.quizzes.push(quiz);
  writeDb(db);
  res.status(201).json({ quiz: { id: quiz.id, title: quiz.title, courseId: quiz.courseId, courseCode: quiz.courseCode, courseTitle: quiz.courseTitle, department: quiz.department, status: quiz.status, questionCount: 0 } });
});

async function readQuestionFile(filePath, extension) {
  const workbook = new ExcelJS.Workbook();
  if (extension === '.csv') {
    await workbook.csv.readFile(filePath);
  } else {
    await workbook.xlsx.readFile(filePath);
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 2) throw new Error('The file has no question rows. Add column headings in row 1 and questions below them.');

  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = clean(cell.text || cell.value).toLowerCase().replace(/[\s_-]/g, '');
  });
  const aliases = {
    question: ['question'],
    optionA: ['optiona', 'a'],
    optionB: ['optionb', 'b'],
    optionC: ['optionc', 'c'],
    optionD: ['optiond', 'd'],
    correctAnswer: ['correctanswer', 'answer', 'correct'],
    explanation: ['explanation', 'feedback']
  };
  const columns = {};
  for (const [field, choices] of Object.entries(aliases)) {
    columns[field] = headers.findIndex(header => choices.includes(header));
  }
  const required = ['question', 'optionA', 'optionB', 'optionC', 'optionD', 'correctAnswer'];
  const missing = required.filter(field => columns[field] < 1);
  if (missing.length) {
    throw new Error(`Missing required column headings: ${missing.join(', ')}. Use the supplied question-template.csv file.`);
  }

  const imported = [];
  const errors = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cellText = field => {
      const index = columns[field];
      return index > 0 ? clean(row.getCell(index).text || row.getCell(index).value) : '';
    };
    const values = {
      question: cellText('question'),
      optionA: cellText('optionA'),
      optionB: cellText('optionB'),
      optionC: cellText('optionC'),
      optionD: cellText('optionD'),
      correctAnswer: cellText('correctAnswer').toUpperCase().replace(/[^A-D]/g, ''),
      explanation: cellText('explanation')
    };
    if (Object.values(values).every(value => !value)) return;
    const rowErrors = [];
    if (!values.question) rowErrors.push('question is empty');
    for (const key of ['optionA', 'optionB', 'optionC', 'optionD']) {
      if (!values[key]) rowErrors.push(`${key} is empty`);
    }
    if (!['A', 'B', 'C', 'D'].includes(values.correctAnswer)) rowErrors.push('correctAnswer must be A, B, C or D');
    if (rowErrors.length) errors.push(`Row ${rowNumber}: ${rowErrors.join(', ')}`);
    else imported.push({
      id: id(),
      question: values.question,
      options: { A: values.optionA, B: values.optionB, C: values.optionC, D: values.optionD },
      correctAnswer: values.correctAnswer,
      explanation: values.explanation
    });
  });
  if (errors.length) throw new Error(errors.slice(0, 8).join(' | ') + (errors.length > 8 ? ` | and ${errors.length - 8} more row error(s)` : ''));
  if (!imported.length) throw new Error('No valid questions were found in the file.');
  if (imported.length > 500) throw new Error('A single upload can contain a maximum of 500 questions. Split the file into smaller files.');
  return imported;
}

app.post('/api/lecturer/quizzes/:quizId/import', requireAuth, requireRole('lecturer'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a CSV or Excel file first.' });
  const filePath = req.file.path;
  try {
    const extension = path.extname(req.file.originalname).toLowerCase();
    if (!['.csv', '.xlsx'].includes(extension)) return res.status(400).json({ error: 'Only .csv and .xlsx files are supported.' });
    const db = readDb();
    const quiz = db.quizzes.find(item => item.id === req.params.quizId);
    if (!quiz || !lecturerOwnsQuiz(quiz, req.user)) return res.status(404).json({ error: 'Quiz not found in your account.' });
    if (quiz.status === 'published') return res.status(400).json({ error: 'This quiz is already published. Create a new draft to import more questions.' });
    const questions = await readQuestionFile(filePath, extension);
    quiz.questions.push(...questions);
    writeDb(db);
    res.json({ message: `${questions.length} question(s) imported successfully.`, imported: questions.length, totalQuestions: quiz.questions.length });
  } catch (error) {
    res.status(400).json({ error: error.message || 'The file could not be processed.' });
  } finally {
    fs.promises.unlink(filePath).catch(() => {});
  }
});

app.post('/api/lecturer/quizzes/:quizId/publish', requireAuth, requireRole('lecturer'), (req, res) => {
  const db = readDb();
  const quiz = db.quizzes.find(item => item.id === req.params.quizId);
  if (!quiz || !lecturerOwnsQuiz(quiz, req.user)) return res.status(404).json({ error: 'Quiz not found in your account.' });
  if (!quiz.questions.length) return res.status(400).json({ error: 'Import at least one question before publishing this quiz.' });
  quiz.status = 'published';
  writeDb(db);
  res.json({ message: 'Quiz published. Students can now see it.' });
});

// STUDENTS: take published quizzes and view their own results after release.
app.get('/api/student/quizzes', requireAuth, requireRole('student'), (req, res) => {
  const context = req.session.studentContext;
  if (!context) return res.status(400).json({ error: 'Please sign out and sign in again, selecting your department and course.' });
  const db = readDb();
  const quizzes = db.quizzes
    .filter(quiz => quiz.status === 'published' && quizDepartment(quiz) === context.department && (quiz.courseId === context.courseId || (!quiz.courseId && quiz.courseCode.toUpperCase() === context.courseCode)))
    .map(safeQuizForStudent);
  res.json({ quizzes, context });
});

app.get('/api/student/quizzes/:quizId/questions', requireAuth, requireRole('student'), (req, res) => {
  const db = readDb();
  const context = req.session.studentContext;
  const quiz = db.quizzes.find(item => item.id === req.params.quizId && item.status === 'published' && context && quizDepartment(item) === context.department && (item.courseId === context.courseId || (!item.courseId && item.courseCode.toUpperCase() === context.courseCode)));
  if (!quiz) return res.status(404).json({ error: 'This quiz is not available for your selected department and course.' });
  req.session.quizStarts = req.session.quizStarts || {};
  if (!req.session.quizStarts[quiz.id]) req.session.quizStarts[quiz.id] = Date.now();
  res.json({ questions: quiz.questions.map(safeQuestionForStudent), startedAt: req.session.quizStarts[quiz.id] });
});

app.post('/api/student/quizzes/:quizId/submit', requireAuth, requireRole('student'), (req, res) => {
  const db = readDb();
  const context = req.session.studentContext;
  const quiz = db.quizzes.find(item => item.id === req.params.quizId && item.status === 'published' && context && quizDepartment(item) === context.department && (item.courseId === context.courseId || (!item.courseId && item.courseCode.toUpperCase() === context.courseCode)));
  if (!quiz) return res.status(404).json({ error: 'This quiz is not available for your selected department and course.' });
  const answers = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
  req.session.quizStarts = req.session.quizStarts || {};
  const startedAt = req.session.quizStarts[quiz.id];
  if (!startedAt) return res.status(400).json({ error: 'Open the quiz before submitting answers.' });
  if (quiz.durationMinutes > 0 && Date.now() - startedAt > (quiz.durationMinutes * 60 * 1000) + 15000) {
    delete req.session.quizStarts[quiz.id];
    return res.status(400).json({ error: 'The quiz time has expired. Please contact your lecturer if you need another attempt.' });
  }
  delete req.session.quizStarts[quiz.id];
  let score = 0;
  for (const question of quiz.questions) {
    if (answers[question.id] === question.correctAnswer) score += 1;
  }
  const total = quiz.questions.length;
  const attempt = {
    id: id(),
    quizId: quiz.id,
    studentId: req.user.id,
    department: context.department,
    courseId: context.courseId,
    courseCode: context.courseCode,
    matricNumber: req.user.matricNumber || '',
    answers,
    score,
    total,
    percentage: total ? Math.round((score / total) * 100) : 0,
    status: 'submitted',
    submittedAt: new Date().toISOString()
  };
  db.attempts.push(attempt);
  writeDb(db);
  res.status(201).json({
    message: quiz.resultsPublished ? 'Quiz submitted. Your result is ready.' : 'Quiz submitted. Your result will appear when the administrator releases it.',
    result: quiz.resultsPublished ? { score, total, percentage: attempt.percentage } : null
  });
});

app.get('/api/student/results', requireAuth, requireRole('student'), (req, res) => {
  const db = readDb();
  const results = db.attempts
    .filter(attempt => attempt.studentId === req.user.id && attempt.status === 'submitted' && (!req.session.studentContext || ((attempt.department || req.user.department) === req.session.studentContext.department && (attempt.courseId === req.session.studentContext.courseId || (!attempt.courseId && (attempt.courseCode || '') === req.session.studentContext.courseCode)))))
    .map(attempt => {
      const quiz = db.quizzes.find(item => item.id === attempt.quizId);
      if (!quiz || !quiz.resultsPublished) return null;
      return {
        id: attempt.id,
        quizTitle: quiz.title,
        courseCode: attempt.courseCode || quiz.courseCode,
        department: attempt.department || quizDepartment(quiz),
        score: attempt.score,
        total: attempt.total,
        percentage: attempt.percentage,
        submittedAt: attempt.submittedAt
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  res.json({ results });
});

app.use('/api', (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'The file is too large. Maximum file size is 5 MB.' : 'The file upload failed.';
    return res.status(400).json({ error: message });
  }
  console.error(error);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initializeStore().then(() => {
    if (process.env.VERCEL !== '1') {
        app.listen(PORT, '0.0.0.0', () => con
    }
}).catch(error => {
    console.error('Could not initialize the
    if (process.env.VERCEL !== '1') {
        process.exit(1);
    }
});

module.exports = app;

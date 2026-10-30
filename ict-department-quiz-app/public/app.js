const app = document.getElementById('app');
const toast = document.getElementById('toast');
const state = { user: null, activeQuiz: null, timerId: null, secondsLeft: 0, catalog: { departments: [], courses: [] } };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('show'), 3500);
}
async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
function pageShell(content) {
  const roleLabel = state.user.role === 'admin' ? 'Administrator' : state.user.role === 'lecturer' ? 'Lecturer' : 'Student';
  return `<div class="app-shell">
    <header class="topbar"><div class="top-brand"><div class="top-brand-mark">ICT</div><div><strong>ICT Department Quiz System</strong><span>Information & Communication Technology</span></div></div>
      <div class="profile"><div class="profile-copy"><strong>${esc(state.user.name)}</strong><span>${roleLabel}</span></div><button class="button secondary" data-action="password">Change password</button><button class="button secondary" data-action="logout">Sign out</button></div>
    </header><main class="workspace">${content}</main>
  </div>`;
}
function heading(title, description) {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${description}</p></div></div>`;
}
function emptyRow(columns, text) { return `<tr><td colspan="${columns}" class="empty">${text}</td></tr>`; }

async function loadApp() {
  try {
    const data = await api('/api/me');
    state.user = data.user;
    await renderDashboard();
  } catch {
    state.user = null;
    renderLogin();
  }
}
function departmentOptions(selected = '') {
  return (state.catalog.departments || []).map(department => `<option value="${esc(department)}" ${department === selected ? 'selected' : ''}>${esc(department)}</option>`).join('');
}

async function loadCatalog() {
  state.catalog = await api('/api/catalog');
  return state.catalog;
}

function updateLoginCourseOptions() {
  const department = document.getElementById('login-department')?.value;
  const select = document.getElementById('login-course');
  if (!select) return;
  const courses = (state.catalog.courses || []).filter(course => course.department === department);
  const options = courses.map(course => `<option value="${esc(course.id)}">${esc(course.courseCode)} — ${esc(course.courseTitle)}</option>`).join('');
  select.innerHTML = `<option value="">${courses.length ? 'Select your course' : 'No courses available for this department'}</option>${options}`;
  select.disabled = courses.length === 0;
  select.required = true;
}

function updateQuizCourseOptions() {
  const department = document.getElementById('quiz-department')?.value;
  const select = document.getElementById('quiz-course');
  if (!select) return;
  const courses = (state.catalog.courses || []).filter(course => course.department === department);
  select.innerHTML = `<option value="">${courses.length ? 'Select a registered course' : 'No courses yet — add one first'}</option>${courses.map(course => `<option value="${esc(course.id)}">${esc(course.courseCode)} — ${esc(course.courseTitle)}</option>`).join('')}`;
  select.disabled = courses.length === 0;
}

function updateLoginRoleFields() {
  const role = document.getElementById('login-role')?.value || 'student';
  const studentFields = document.getElementById('student-login-fields');
  const staffFields = document.getElementById('staff-login-fields');
  const matric = document.querySelector('#login-form [name="matricNumber"]');
  const department = document.querySelector('#login-form [name="department"]');
  const course = document.querySelector('#login-form [name="courseId"]');
  const email = document.querySelector('#login-form [name="email"]');
  const isStudent = role === 'student';
  studentFields?.classList.toggle('hidden', !isStudent);
  staffFields?.classList.toggle('hidden', isStudent);
  if (matric) matric.required = isStudent;
  if (department) department.required = isStudent;
  if (course) course.required = isStudent;
  if (email) email.required = !isStudent;
}

function renderLogin() {
  clearInterval(state.timerId);
  app.innerHTML = `<main class="login-wrap"><section class="login-card"><div class="brand-mark">ICT</div><p class="eyebrow">INFORMATION & COMMUNICATION TECHNOLOGY</p><h1>Department Quiz System</h1><p class="muted">Students sign in with their matriculation number. Lecturers and administrators use their email address.</p>
    <form id="login-form" class="form-stack">
      <label>Account type<select id="login-role" name="role"><option value="student">Student / User</option><option value="lecturer">Lecturer</option><option value="admin">Administrator</option></select></label>
      <div id="student-login-fields" class="form-stack nested-fields">
        <label>Matriculation number<input name="matricNumber" placeholder="e.g. ICT/23/001" autocomplete="username" required></label>
        <label>Department<select id="login-department" name="department" required>${departmentOptions()}</select></label>
        <label>Course<select id="login-course" name="courseId" required><option value="">Loading registered courses...</option></select></label>
        <div class="form-actions"><button class="button secondary" type="button" data-action="refresh-courses">Refresh course list</button></div>
        <p class="helper">Courses are added by lecturers. Refresh this list or contact your lecturer if your course is missing.</p>
      </div>
      <div id="staff-login-fields" class="form-stack nested-fields hidden"><label>Email address<input type="email" name="email" placeholder="you@example.com" autocomplete="username"></label></div>
      <label>Password<input type="password" name="password" placeholder="Enter your password" required autocomplete="current-password"></label>
      <button class="button primary full" type="submit">Sign in</button><p id="login-error" class="form-error" role="alert"></p>
    </form>
    <p class="login-foot">For account access, contact the ICT department administrator. Your student department must match the department registered by the administrator.</p></section></main>`;
  updateLoginRoleFields();
  loadCatalog().then(() => {
    const department = document.getElementById('login-department');
    if (department) department.innerHTML = departmentOptions(state.catalog.departments[0]);
    updateLoginCourseOptions();
  }).catch(error => {
    const errorElement = document.getElementById('login-error');
    if (errorElement) errorElement.textContent = `Could not load department and course options: ${error.message}`;
  });
}
async function renderDashboard() {
  if (!state.user) return renderLogin();
  if (state.user.role === 'admin') return renderAdmin();
  if (state.user.role === 'lecturer') return renderLecturer();
  return renderStudent();
}

async function renderAdmin() {
  const [overview, users, results, catalog] = await Promise.all([
    api('/api/admin/overview'), api('/api/admin/users'), api('/api/admin/results'), loadCatalog()
  ]);
  const counts = overview.counts;
  const quizRows = overview.quizzes.map(quiz => `<tr>
    <td><strong>${esc(quiz.title)}</strong><div class="small">${esc(quiz.courseCode)} — ${esc(quiz.courseTitle || quiz.courseCode)}</div></td><td>${esc(quiz.department || '—')}</td>
    <td>${quiz.questionCount}</td><td>${quiz.attempts}</td><td>${quiz.average}%</td>
    <td><span class="badge ${quiz.status === 'published' ? 'green' : 'amber'}">${esc(quiz.status)}</span></td>
    <td><span class="badge ${quiz.resultsPublished ? 'green' : 'gray'}">${quiz.resultsPublished ? 'Released' : 'Hidden'}</span></td>
    <td><button class="button ${quiz.resultsPublished ? 'secondary' : 'success'}" data-action="toggle-results" data-id="${quiz.id}" data-published="${!quiz.resultsPublished}">${quiz.resultsPublished ? 'Hide results' : 'Display results'}</button></td>
  </tr>`).join('');
  const userRows = users.users.map(user => { const loginId = user.role === 'student' ? user.matricNumber : user.email; return `<tr><td><strong>${esc(user.name)}</strong></td><td>${esc(loginId || '—')}</td><td>${esc(user.department || '—')}</td><td>${esc(user.role)}</td><td><span class="badge ${user.active ? 'green' : 'red'}">${user.active ? 'Active' : 'Disabled'}</span></td><td>${user.role === 'admin' ? '<span class="small">System account</span>' : `<button class="button ${user.active ? 'danger' : 'success'}" data-action="toggle-user" data-id="${user.id}" data-active="${!user.active}">${user.active ? 'Disable' : 'Enable'}</button>`}</td></tr>`; }).join('');
  const resultRows = results.results.map(item => `<tr><td><strong>${esc(item.studentName)}</strong><div class="small">${esc(item.studentMatricNumber || item.studentEmail || '—')}</div></td><td>${esc(item.department || '—')}</td><td>${esc(item.courseCode || '—')}</td><td>${esc(item.quizTitle)}</td><td><strong>${item.score}/${item.total}</strong></td><td>${item.percentage}%</td><td>${new Date(item.submittedAt).toLocaleString()}</td></tr>`).join('');
  app.innerHTML = pageShell(`${heading('Admin dashboard', 'Manage accounts, monitor quiz activity and control when student results are displayed.')}
    <div class="grid">
      <div class="stat-card"><span>Students</span><strong>${counts.students}</strong></div><div class="stat-card"><span>Lecturers</span><strong>${counts.lecturers}</strong></div><div class="stat-card"><span>Total quizzes</span><strong>${counts.quizzes}</strong></div><div class="stat-card"><span>Registered courses</span><strong>${counts.courses || 0}</strong></div><div class="stat-card"><span>Submissions</span><strong>${counts.submissions}</strong></div>
    </div>
    <div class="section-title"><h2>Account management</h2></div>
    <div class="two-col">
      <section class="panel"><h3>Create a lecturer or student account</h3><form id="create-user-form" class="form-grid">
        <label class="span-2">Full name<input name="name" required placeholder="Enter full name"></label>
        <label class="span-2">Role<select id="new-user-role" name="role"><option value="student">Student / User</option><option value="lecturer">Lecturer</option></select></label>
        <div class="span-2" data-role-fields="student"><div class="form-grid"><label>Matriculation number<input name="matricNumber" placeholder="e.g. ICT/23/001" required></label><label>Department<select name="department" required>${departmentOptions()}</select></label></div></div>
        <label class="span-2 hidden" data-role-fields="lecturer">Lecturer email address<input type="email" name="email" placeholder="lecturer@example.com"></label>
        <label class="span-2">Temporary password<input type="password" name="password" minlength="8" required placeholder="At least 8 characters"></label>
        <div class="span-2 form-actions"><button class="button primary" type="submit">Create account</button></div>
      </form><p class="helper">For students, the matriculation number is their login ID. Lecturers use their email address. Give each person their password privately.</p></section>
      <section class="panel"><h3>Registered accounts</h3><div class="table-wrap"><table><thead><tr><th>Name</th><th>Matric no. / Email</th><th>Department</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>${userRows || emptyRow(6, 'No accounts found.')}</tbody></table></div></section>
    </div>
    <div class="section-title"><h2>Quiz management and result release</h2></div>
    <section class="panel"><div class="table-wrap"><table><thead><tr><th>Quiz / course</th><th>Department</th><th>Questions</th><th>Attempts</th><th>Average</th><th>Quiz status</th><th>Results</th><th>Action</th></tr></thead><tbody>${quizRows || emptyRow(8, 'Lecturers have not created any quizzes yet.')}</tbody></table></div><p class="helper">Use “Display results” only when you are ready for students to see their own scores.</p></section>
    <div class="section-title"><h2>Submitted results</h2></div>
    <section class="panel"><div class="table-wrap"><table><thead><tr><th>Student / Matric no.</th><th>Department</th><th>Course</th><th>Quiz</th><th>Score</th><th>Percentage</th><th>Submitted</th></tr></thead><tbody>${resultRows || emptyRow(7, 'No quiz submissions yet.')}</tbody></table></div></section>`);
  initAccountRoleFields();
}

async function renderLecturer() {
  const [data, courseData] = await Promise.all([api('/api/lecturer/quizzes'), api('/api/lecturer/courses'), loadCatalog()]);
  const cards = data.quizzes.map(quiz => `<article class="quiz-card">
    <span class="badge ${quiz.status === 'published' ? 'green' : 'amber'}">${esc(quiz.status)}</span>
    <h3>${esc(quiz.title)}</h3><div class="quiz-meta"><span>${esc(quiz.department || '')}</span><span>${esc(quiz.courseCode)} — ${esc(quiz.courseTitle || quiz.courseCode)}</span><span>${quiz.questionCount} question(s)</span><span>${quiz.durationMinutes ? `${quiz.durationMinutes} min` : 'No time limit'}</span></div>
    ${quiz.status === 'draft' ? `<form class="import-form" data-quiz-id="${quiz.id}"><div class="file-box"><label>Upload question file (.csv or .xlsx)<input type="file" name="file" accept=".csv,.xlsx" required></label><p class="helper">You can upload more than two questions in one file. Maximum 500 questions per upload.</p></div><div class="form-actions"><button class="button primary" type="submit">Import questions</button><button class="button secondary" type="button" data-action="publish-quiz" data-id="${quiz.id}" ${quiz.questionCount ? '' : 'disabled'}>Publish quiz</button></div></form>` : '<p class="helper">This quiz is published and available to students. Create a new draft to add more questions.</p>'}
  </article>`).join('');
  const courseRows = courseData.courses.map(course => `<tr>
    <td><strong>${esc(course.courseCode)}</strong></td><td>${esc(course.courseTitle)}</td><td>${esc(course.department)}</td><td>${course.quizCount}</td>
    <td>${course.canManage ? '<span class="badge green">Created by you</span>' : '<span class="badge gray">Shared course</span>'}</td>
    <td>${course.canManage ? `<div class="form-actions"><button class="button secondary" data-action="edit-course" data-id="${course.id}" data-code="${esc(course.courseCode)}" data-title="${esc(course.courseTitle)}">Edit</button><button class="button danger" data-action="delete-course" data-id="${course.id}" ${course.quizCount ? 'disabled title="Course has linked quizzes"' : ''}>Remove</button></div>` : '<span class="small">Managed by another lecturer</span>'}</td>
  </tr>`).join('');
  app.innerHTML = pageShell(`${heading('Lecturer workspace', 'Create courses, manage your course list, build quizzes, import question banks in bulk and publish quizzes for students.')}
    <div class="two-col">
      <section class="panel"><h3>Add a course to the department catalogue</h3><form id="create-course-form" class="form-grid">
        <label>Department<select name="department" required>${departmentOptions()}</select></label>
        <label>Course code<input name="courseCode" required maxlength="30" placeholder="e.g. ICT 201"></label>
        <label class="span-2">Course title<input name="courseTitle" required maxlength="120" placeholder="e.g. Introduction to Programming"></label>
        <div class="span-2 form-actions"><button class="button primary" type="submit">Add course</button></div>
      </form><p class="helper">After adding a course, it immediately appears in the student login course list. Course codes must be unique within a department.</p></section>
      <section class="panel"><h3>Create a new quiz</h3><form id="create-quiz-form" class="form-grid">
        <label class="span-2">Quiz title<input name="title" required placeholder="e.g. Introduction to Computer Systems"></label>
        <label>Department<select id="quiz-department" name="department" required>${departmentOptions()}</select></label>
        <label>Course<select id="quiz-course" name="courseId" required><option value="">Select a department first</option></select></label>
        <label>Duration (minutes)<input type="number" name="durationMinutes" min="0" max="240" value="30" required></label>
        <div class="span-2 form-actions"><button class="button primary" type="submit">Create quiz</button></div>
      </form><p class="helper">Choose a registered course. Set duration to 0 for no time limit. Import questions before publishing.</p></section>
    </div>
    <div class="section-title"><h2>Department course catalogue</h2></div>
    <section class="panel"><div class="table-wrap"><table><thead><tr><th>Course code</th><th>Course title</th><th>Department</th><th>Quizzes</th><th>Access</th><th>Manage</th></tr></thead><tbody>${courseRows || emptyRow(6, 'No courses have been added. Add the first course above.')}</tbody></table></div><p class="helper">You can edit or remove courses you created. A course with linked quizzes cannot be removed; edit its details instead. Other lecturers can use shared courses when creating quizzes.</p></section>
    <div class="two-col" style="margin-top:16px"><section class="panel"><h3>Bulk question upload format</h3><p class="muted" style="font-size:12px">Prepare your questions in Excel and save as .xlsx, or save a sheet as .csv. Use the exact column headings below.</p>
        <div class="notice"><strong>Required headings:</strong> question, optionA, optionB, optionC, optionD, correctAnswer<br><strong>Optional heading:</strong> explanation<br><strong>Answer format:</strong> A, B, C or D</div>
        <a class="button secondary" href="/question-template.csv" download>Download CSV template</a><p class="helper">Every non-empty row becomes one multiple-choice question. Files must be 5 MB or smaller.</p>
      </section><section class="panel"><h3>Your quizzes</h3><div class="quiz-list">${cards || '<div class="empty">You have not created a quiz yet. Add a course and create one above.</div>'}</div></section></div>`);
  updateQuizCourseOptions();
}

async function renderStudent() {
  const [quizData, resultData] = await Promise.all([api('/api/student/quizzes'), api('/api/student/results')]);
  const cards = quizData.quizzes.map(quiz => `<article class="quiz-card"><span class="badge green">Available</span><h3>${esc(quiz.title)}</h3><div class="quiz-meta"><span>${esc(quiz.department || '')}</span><span>${esc(quiz.courseCode)} — ${esc(quiz.courseTitle || quiz.courseCode)}</span><span>${quiz.questionCount} question(s)</span><span>${quiz.durationMinutes ? `${quiz.durationMinutes} min` : 'No time limit'}</span></div><button class="button primary" data-action="take-quiz" data-id="${quiz.id}">Start quiz</button></article>`).join('');
  const rows = resultData.results.map(result => `<tr><td><strong>${esc(result.quizTitle)}</strong><div class="small">${esc(result.courseCode)}</div></td><td>${result.score}/${result.total}</td><td><strong>${result.percentage}%</strong></td><td>${new Date(result.submittedAt).toLocaleString()}</td></tr>`).join('');
  app.innerHTML = pageShell(`${heading(`Welcome, ${esc(state.user.name.split(' ')[0])}`, `Matric No: ${esc(state.user.matricNumber)} · Department: ${esc(state.user.department)} · Selected course: ${esc(quizData.context?.courseCode || state.user.selectedCourseCode || '')} — ${esc(quizData.context?.courseTitle || state.user.selectedCourseTitle || '')}`)}
    <div class="section-title"><h2>Available quizzes</h2></div>
    <div class="quiz-list">${cards || `<div class="panel empty">There are no published quizzes for ${esc(quizData.context?.courseCode || state.user.selectedCourseCode || 'your selected course')} yet. Check again later or contact your lecturer.</div>`}</div>
    <div class="section-title"><h2>My results</h2></div>
    <section class="panel"><div class="table-wrap"><table><thead><tr><th>Quiz</th><th>Score</th><th>Percentage</th><th>Submitted</th></tr></thead><tbody>${rows || emptyRow(4, 'No results have been released to you yet.')}</tbody></table></div></section>`);
}

async function openQuiz(quizId) {
  const data = await api('/api/student/quizzes');
  const quiz = data.quizzes.find(item => item.id === quizId);
  if (!quiz) throw new Error('This quiz is no longer available.');
  // A separate question request intentionally does not expose the answer key.
  const questionData = await api(`/api/student/quizzes/${quizId}/questions`);
  state.activeQuiz = { ...quiz, questions: questionData.questions };
  state.secondsLeft = quiz.durationMinutes ? Math.max(0, quiz.durationMinutes * 60 - Math.floor((Date.now() - questionData.startedAt) / 1000)) : 0;
  renderQuizAttempt();
}
function renderQuizAttempt() {
  const quiz = state.activeQuiz;
  if (!quiz) return renderStudent();
  clearInterval(state.timerId);
  const questionHtml = quiz.questions.map((question, index) => `<section class="question"><h3>${index + 1}. ${esc(question.question)}</h3>${Object.entries(question.options).map(([key, value]) => `<label class="option"><input type="radio" name="${question.id}" value="${key}"><span><strong>${key}.</strong> ${esc(value)}</span></label>`).join('')}</section>`).join('');
  app.innerHTML = pageShell(`${heading(esc(quiz.title), `Department: ${esc(state.user.department)} · Course: ${esc(quiz.courseCode)} · Matric No: ${esc(state.user.matricNumber)} · ${quiz.questions.length} questions`)}
    <div class="notice">Choose one answer for each question. Your score is calculated automatically after submission. You cannot see the correct answers during the quiz.</div>
    <section class="panel"><div class="section-title" style="margin-top:0"><h2>Quiz questions</h2>${quiz.durationMinutes ? `<span class="timer" id="quiz-timer">Time left: ${formatTime(state.secondsLeft)}</span>` : '<span class="badge gray">No time limit</span>'}</div>
      <form id="attempt-form">${questionHtml}<div class="form-actions" style="margin-top:18px"><button class="button primary" type="submit">Submit answers</button><button class="button secondary" type="button" data-action="cancel-quiz">Cancel</button></div></form>
    </section>`);
  if (quiz.durationMinutes) {
    state.timerId = setInterval(() => {
      state.secondsLeft -= 1;
      const timer = document.getElementById('quiz-timer');
      if (timer) timer.textContent = `Time left: ${formatTime(Math.max(0, state.secondsLeft))}`;
      if (state.secondsLeft <= 0) {
        clearInterval(state.timerId);
        const form = document.getElementById('attempt-form');
        if (form) form.requestSubmit();
      }
    }, 1000);
  }
}
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

// Question endpoint is defined separately to ensure students never receive correctAnswer.
// It is placed here as a client route only; the server route is registered below via fetch.


function initAccountRoleFields() {
  const roleSelect = document.getElementById('new-user-role');
  if (!roleSelect) return;
  const update = () => {
    const role = roleSelect.value;
    document.querySelectorAll('#create-user-form [data-role-fields]').forEach(group => {
      const active = group.dataset.roleFields === role;
      group.classList.toggle('hidden', !active);
      group.querySelectorAll('input, select').forEach(input => {
        input.disabled = !active;
        input.required = active;
      });
    });
  };
  roleSelect.addEventListener('change', update);
  update();
}

document.addEventListener('change', event => {
  if (event.target.id === 'login-role') updateLoginRoleFields();
  if (event.target.id === 'login-department') updateLoginCourseOptions();
  if (event.target.id === 'quiz-department') updateQuizCourseOptions();
});

document.addEventListener('submit', async event => {
  const form = event.target;
  try {
    if (form.id === 'login-form') {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const result = await api('/api/login', { method: 'POST', body: JSON.stringify(data) });
      state.user = result.user;
      await renderDashboard();
    } else if (form.id === 'create-user-form') {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      await api('/api/admin/users', { method: 'POST', body: JSON.stringify(data) });
      showToast('Account created successfully.');
      await renderAdmin();
    } else if (form.id === 'create-course-form') {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const result = await api('/api/lecturer/courses', { method: 'POST', body: JSON.stringify(data) });
      showToast(result.message);
      await renderLecturer();
    } else if (form.id === 'create-quiz-form') {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      await api('/api/lecturer/quizzes', { method: 'POST', body: JSON.stringify(data) });
      showToast('Quiz created. Import your questions next.');
      await renderLecturer();
    } else if (form.classList.contains('import-form')) {
      event.preventDefault();
      const quizId = form.dataset.quizId;
      const file = form.querySelector('input[type="file"]').files[0];
      if (!file) throw new Error('Choose a question file first.');
      const body = new FormData();
      body.append('file', file);
      const result = await api(`/api/lecturer/quizzes/${quizId}/import`, { method: 'POST', body });
      showToast(result.message);
      await renderLecturer();
    } else if (form.id === 'change-password-form') {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if (data.newPassword !== data.confirmPassword) throw new Error('The new passwords do not match.');
      await api('/api/change-password', { method: 'POST', body: JSON.stringify(data) });
      document.getElementById('password-modal')?.remove();
      showToast('Your password has been changed.');
    } else if (form.id === 'attempt-form') {
      event.preventDefault();
      clearInterval(state.timerId);
      const answers = {};
      for (const question of state.activeQuiz.questions) {
        const selected = form.querySelector(`input[name="${CSS.escape(question.id)}"]:checked`);
        if (selected) answers[question.id] = selected.value;
      }
      const result = await api(`/api/student/quizzes/${state.activeQuiz.id}/submit`, { method: 'POST', body: JSON.stringify({ answers }) });
      state.activeQuiz = null;
      if (result.result) {
        app.innerHTML = pageShell(`${heading('Quiz submitted', 'Your result is available.')}
          <section class="panel" style="max-width:540px;margin:auto;text-align:center"><p class="eyebrow">YOUR SCORE</p><h1 style="font-size:44px;color:var(--navy)">${result.result.percentage}%</h1><h2>${result.result.score} out of ${result.result.total}</h2><p class="muted">${esc(result.message)}</p><button class="button primary" data-action="student-home">Back to dashboard</button></section>`);
      } else {
        showToast(result.message);
        await renderStudent();
      }
    }
  } catch (error) {
    const errorElement = document.getElementById('login-error');
    if (errorElement && form.id === 'login-form') errorElement.textContent = error.message;
    else showToast(error.message);
  }
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  try {
    if (action === 'password') {
      document.getElementById('password-modal')?.remove();
      app.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="password-modal"><section class="panel password-modal"><div class="section-title" style="margin-top:0"><h2>Change password</h2><button class="button secondary" type="button" data-action="close-password">Close</button></div><form id="change-password-form" class="form-stack"><label>Current password<input type="password" name="currentPassword" required></label><label>New password<input type="password" name="newPassword" minlength="8" required></label><label>Confirm new password<input type="password" name="confirmPassword" minlength="8" required></label><button class="button primary" type="submit">Save new password</button></form></section></div>`);
    } else if (action === 'close-password') {
      document.getElementById('password-modal')?.remove();
    } else if (action === 'logout') {
      clearInterval(state.timerId);
      await api('/api/logout', { method: 'POST' });
      state.user = null;
      state.activeQuiz = null;
      renderLogin();
    } else if (action === 'toggle-user') {
      await api(`/api/admin/users/${button.dataset.id}/status`, { method: 'PATCH', body: JSON.stringify({ active: button.dataset.active === 'true' }) });
      showToast('Account status updated.');
      await renderAdmin();
    } else if (action === 'toggle-results') {
      await api(`/api/admin/quizzes/${button.dataset.id}/results`, { method: 'PATCH', body: JSON.stringify({ published: button.dataset.published === 'true' }) });
      showToast(button.dataset.published === 'true' ? 'Results released to students.' : 'Results hidden from students.');
      await renderAdmin();
    } else if (action === 'refresh-courses') {
      await loadCatalog();
      updateLoginCourseOptions();
      showToast('Course list refreshed.');
    } else if (action === 'edit-course') {
      const courseCode = prompt('Enter the course code:', button.dataset.code);
      if (courseCode === null) return;
      const courseTitle = prompt('Enter the course title:', button.dataset.title);
      if (courseTitle === null) return;
      const result = await api(`/api/lecturer/courses/${button.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ courseCode, courseTitle }) });
      showToast(result.message);
      await renderLecturer();
    } else if (action === 'delete-course') {
      if (!confirm('Remove this course from the active course list?')) return;
      const result = await api(`/api/lecturer/courses/${button.dataset.id}`, { method: 'DELETE' });
      showToast(result.message);
      await renderLecturer();
    } else if (action === 'publish-quiz') {
      const result = await api(`/api/lecturer/quizzes/${button.dataset.id}/publish`, { method: 'POST' });
      showToast(result.message);
      await renderLecturer();
    } else if (action === 'take-quiz') {
      await openQuiz(button.dataset.id);
    } else if (action === 'cancel-quiz' || action === 'student-home') {
      clearInterval(state.timerId);
      state.activeQuiz = null;
      await renderStudent();
    }
  } catch (error) {
    showToast(error.message);
  }
});

loadApp();

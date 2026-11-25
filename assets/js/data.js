/**
 * AL-IMAAMA - Data Management Layer
 * Provides high-level relational queries and CRUD operations.
 */

import { Storage } from './storage.js';
import { Permissions } from './permissions.js';
import { API } from './api.js';
import { PaymentSyncEngine, PAYMENT_SYNC_STATUS } from './payment_sync.js';

export const Data = {
  _getActiveSessionUser() {
    const session = Storage.get(Storage.KEYS.SESSION, null);
    if (!session) return null;
    if (session.role === 'TEACHER') {
      const teachers = Storage.get(Storage.KEYS.TEACHERS, []);
      const t = teachers.find(x => (session.email && x.email.toLowerCase() === session.email.toLowerCase()) || x.id === session.teacherId);
      session.teacherDetails = t || null;
    }
    return session;
  },

  _checkPermission(module, action) {
    const user = this._getActiveSessionUser();
    if (!user) return true; // Allows programmatic/seed calls before login
    return Permissions.hasPermission(user, module, action);
  },

  // --- STUDENTS ---
  getStudents() {
    return Storage.get(Storage.KEYS.STUDENTS, []);
  },

  getStudentById(id) {
    const students = this.getStudents();
    return students.find(s => s.id === id) || null;
  },

  getStudentsByClass(classId) {
    const students = this.getStudents();
    return students.filter(s => s.classId === classId);
  },

  addStudent(studentData) {
    return this.createStudent(studentData);
  },

  async createStudent(studentData) {
    if (!this._checkPermission('students', 'add')) {
      throw new Error('You do not have permission to register students.');
    }
    if (!API.hasToken()) {
      throw new Error('A backend login is required to save student records. Please sign in again.');
    }

    const admissionNumber = studentData.admissionNumber || studentData.id || Storage.generateNextStudentId();
    const response = await API.students.create({
      admission_number: admissionNumber,
      full_name: (studentData.fullName || '').trim(),
      gender: studentData.gender,
      date_of_birth: studentData.dateOfBirth,
      parent_phone: (studentData.parentPhone || '').trim(),
      classroom: studentData.classId,
      registration_date: studentData.registrationDate || new Date().toISOString().split('T')[0],
      status: studentData.status || 'Active',
    });

    // Use the confirmed API response as the source of truth. Preserve the UUID
    // primary key for relationships and the admission number for display.
    const savedStudent = {
      id: response.id,
      admissionNumber: response.admission_number || response.studentId || admissionNumber,
      fullName: response.full_name || response.fullName || studentData.fullName.trim(),
      gender: response.gender || studentData.gender,
      dateOfBirth: response.date_of_birth || response.dateOfBirth || studentData.dateOfBirth,
      parentPhone: response.parent_phone || response.parentPhone || studentData.parentPhone.trim(),
      classId: response.classroom || response.classId || response.class_id || studentData.classId,
      registrationDate: response.registration_date || response.registrationDate || studentData.registrationDate,
      status: response.status || studentData.status || 'Active',
    };
    const students = this.getStudents().filter(student =>
      student.id !== savedStudent.id && student.admissionNumber !== savedStudent.admissionNumber
    );
    students.push(savedStudent);
    Storage.set(Storage.KEYS.STUDENTS, students);
    return savedStudent;
  },

  updateStudent(id, studentData) {
    if (!this._checkPermission('students', 'edit')) {
      return null;
    }
    const students = this.getStudents();
    const index = students.findIndex(s => s.id === id);
    if (index === -1) return null;

    students[index] = {
      ...students[index],
      fullName: studentData.fullName.trim(),
      gender: studentData.gender,
      dateOfBirth: studentData.dateOfBirth,
      parentPhone: studentData.parentPhone.trim(),
      classId: studentData.classId,
      registrationDate: studentData.registrationDate
    };
    Storage.set(Storage.KEYS.STUDENTS, students);
    return students[index];
  },

  deleteStudent(id) {
    if (!this._checkPermission('students', 'delete')) {
      return false;
    }
    let students = this.getStudents();
    const exists = students.some(s => s.id === id);
    if (!exists) return false;
    students = students.filter(s => s.id !== id);
    Storage.set(Storage.KEYS.STUDENTS, students);
    return true;
  },

  // --- CLASSES ---
  getClasses() {
    return Storage.get(Storage.KEYS.CLASSES, []);
  },

  getClassById(id) {
    const classes = this.getClasses();
    return classes.find(c => c.id === id) || null;
  },

  addClass(classData) {
    const classes = this.getClasses();
    const newClass = {
      id: classData.id || Storage.uuid('cls'),
      name: classData.name.trim(),
      section: classData.section ? classData.section.trim() : 'A',
      room: classData.room ? classData.room.trim() : '',
      capacity: parseInt(classData.capacity, 10) || 30,
      teacherId: classData.teacherId || '',
      academicYear: classData.academicYear || '2026-2027'
    };
    classes.push(newClass);
    Storage.set(Storage.KEYS.CLASSES, classes);
    return newClass;
  },

  updateClass(id, classData) {
    const classes = this.getClasses();
    const index = classes.findIndex(c => c.id === id);
    if (index === -1) return null;

    classes[index] = {
      ...classes[index],
      name: classData.name.trim(),
      section: classData.section ? classData.section.trim() : 'A',
      room: classData.room ? classData.room.trim() : '',
      capacity: parseInt(classData.capacity, 10) || 30,
      teacherId: classData.teacherId || '',
      academicYear: classData.academicYear || classes[index].academicYear
    };
    Storage.set(Storage.KEYS.CLASSES, classes);
    return classes[index];
  },

  deleteClass(id) {
    // Check if class has active students
    const students = this.getStudentsByClass(id);
    if (students.length > 0) {
      return { success: false, reason: `Cannot delete class containing ${students.length} active students.` };
    }
    let classes = this.getClasses();
    classes = classes.filter(c => c.id !== id);
    Storage.set(Storage.KEYS.CLASSES, classes);
    return { success: true };
  },

  // --- SUBJECTS ---
  getSubjects() {
    return Storage.get(Storage.KEYS.SUBJECTS, []);
  },

  _mapSubjectFromApi(subject) {
    return {
      id: subject.id,
      classId: subject.classroom || subject.classId || subject.classroom_id || '',
      name: subject.name || '',
      code: subject.code || '',
      maxMarks: Number(subject.max_marks ?? subject.maxMarks ?? 100),
      passMark: Number(subject.pass_mark ?? subject.passMark ?? 50),
      teacherId: subject.teacher || subject.teacherId || '',
    };
  },

  async syncSubjectsFromBackend() {
    const response = await API.subjects.list();
    const subjects = Array.isArray(response) ? response : (response.results || []);
    const mapped = subjects.map(subject => this._mapSubjectFromApi(subject));
    Storage.set(Storage.KEYS.SUBJECTS, mapped);
    return mapped;
  },

  async _refreshSubjectsAfterMutation() {
    try {
      await this.syncSubjectsFromBackend();
      return true;
    } catch (error) {
      console.warn('Subject was saved, but the subject list could not be refreshed:', error);
      return false;
    }
  },

  getSubjectsByClass(classId) {
    const subjects = this.getSubjects();
    return subjects.filter(s => s.classId === classId);
  },

  addSubject(subjectData) {
    return this.createSubject(subjectData);
  },

  async createSubject(subjectData) {
    if (!API.hasToken()) {
      throw new Error('A backend login is required to save subjects. Please sign in again.');
    }
    const response = await API.subjects.create({
      classroom: subjectData.classId,
      name: (subjectData.name || '').trim(),
      code: subjectData.code ? subjectData.code.trim().toUpperCase() : null,
      max_marks: parseInt(subjectData.maxMarks, 10) || 100,
    });
    const savedSubject = this._mapSubjectFromApi(response);
    if (!savedSubject.id) {
      throw new Error('The backend accepted the subject but did not return its ID.');
    }
    const subjects = this.getSubjects().filter(subject => subject.id !== savedSubject.id);
    subjects.push(savedSubject);
    Storage.set(Storage.KEYS.SUBJECTS, subjects);
    const listRefreshed = await this._refreshSubjectsAfterMutation();
    return { ...savedSubject, refreshWarning: !listRefreshed };
  },

  async updateSubject(id, subjectData) {
    if (!API.hasToken()) {
      throw new Error('A backend login is required to update subjects. Please sign in again.');
    }
    const response = await API.subjects.update(id, {
      classroom: subjectData.classId,
      name: (subjectData.name || '').trim(),
      code: subjectData.code ? subjectData.code.trim().toUpperCase() : null,
      max_marks: parseInt(subjectData.maxMarks, 10) || 100,
    });
    const savedSubject = this._mapSubjectFromApi(response);
    const subjects = this.getSubjects().filter(subject => subject.id !== id && subject.id !== savedSubject.id);
    subjects.push(savedSubject);
    Storage.set(Storage.KEYS.SUBJECTS, subjects);
    const listRefreshed = await this._refreshSubjectsAfterMutation();
    return { ...savedSubject, refreshWarning: !listRefreshed };
  },

  async deleteSubject(id) {
    const exams = this._getRawExaminations();
    let marksExist = false;
    exams.forEach(ex => {
      if (ex.marks) {
        Object.keys(ex.marks).forEach(stId => {
          const entry = ex.marks[stId];
          if (entry && entry[id] !== undefined && entry[id] !== null && entry[id] !== '') {
            marksExist = true;
          }
        });
      }
    });

    if (marksExist) {
      return {
        success: false,
        reason: 'Cannot delete this subject because examination marks have already been recorded for it.'
      };
    }

    if (!API.hasToken()) {
      throw new Error('A backend login is required to delete subjects. Please sign in again.');
    }
    await API.subjects.delete(id);
    const subjects = this.getSubjects().filter(subject => subject.id !== id);
    Storage.set(Storage.KEYS.SUBJECTS, subjects);
    const listRefreshed = await this._refreshSubjectsAfterMutation();
    return { success: true, refreshWarning: !listRefreshed };
  },

  // --- TEACHERS ---
  getTeachers() {
    return Storage.get(Storage.KEYS.TEACHERS, []);
  },

  getTeacherById(id) {
    const teachers = this.getTeachers();
    return teachers.find(t => t.id === id) || null;
  },

  getTeacherByEmail(email) {
    const teachers = this.getTeachers();
    return teachers.find(t => t.email.toLowerCase() === email.toLowerCase()) || null;
  },

  _mapTeacherFromApi(teacher) {
    return {
      id: teacher.id,
      fullName: teacher.full_name || teacher.fullName || '',
      email: teacher.email || '',
      phone: teacher.phone || '',
      specialization: teacher.specialization || '',
      joinedDate: teacher.joined_date || teacher.joinedDate || teacher.joiningDate || '',
      assignedClassIds: teacher.assigned_class_ids || teacher.assignedClassIds || [],
      assignedSubjectIds: teacher.assigned_subject_ids || teacher.assignedSubjectIds || [],
      accountStatus: teacher.account_status || teacher.accountStatus || 'Active',
    };
  },

  async syncTeachersFromBackend() {
    const response = await API.teachers.list();
    const teachers = Array.isArray(response) ? response : (response.results || []);
    const mapped = teachers.map(teacher => this._mapTeacherFromApi(teacher));
    Storage.set(Storage.KEYS.TEACHERS, mapped);
    return mapped;
  },

  async _refreshTeachersAfterMutation() {
    try {
      await this.syncTeachersFromBackend();
      return true;
    } catch (error) {
      console.warn('Teacher was saved, but the teacher list could not be refreshed:', error);
      return false;
    }
  },

  addTeacher(teacherData) {
    return this.createTeacher(teacherData);
  },

  async createTeacher(teacherData) {
    if (!API.hasToken()) {
      throw new Error('A backend login is required to save teachers. Please sign in again.');
    }
    const response = await API.teachers.create({
      full_name: (teacherData.fullName || '').trim(),
      email: (teacherData.email || '').trim().toLowerCase(),
      phone: (teacherData.phone || '').trim(),
      account_status: teacherData.accountStatus || 'Active',
      specialization: (teacherData.specialization || '').trim(),
      joined_date: teacherData.joinedDate || new Date().toISOString().split('T')[0],
      assigned_class_ids: teacherData.assignedClassIds || [],
      assigned_subject_ids: teacherData.assignedSubjectIds || [],
    });
    const savedTeacher = this._mapTeacherFromApi(response);
    if (!savedTeacher.id) throw new Error('The backend accepted the teacher but did not return its ID.');
    const teachers = this.getTeachers().filter(teacher => teacher.id !== savedTeacher.id);
    teachers.push(savedTeacher);
    Storage.set(Storage.KEYS.TEACHERS, teachers);
    const listRefreshed = await this._refreshTeachersAfterMutation();
    return { ...savedTeacher, refreshWarning: !listRefreshed };
  },

  async updateTeacher(id, teacherData) {
    if (!API.hasToken()) {
      throw new Error('A backend login is required to update teachers. Please sign in again.');
    }
    const response = await API.teachers.update(id, {
      full_name: (teacherData.fullName || '').trim(),
      email: (teacherData.email || '').trim().toLowerCase(),
      phone: (teacherData.phone || '').trim(),
      account_status: teacherData.accountStatus || 'Active',
      specialization: (teacherData.specialization || '').trim(),
      joined_date: teacherData.joinedDate || new Date().toISOString().split('T')[0],
      assigned_class_ids: teacherData.assignedClassIds || [],
      assigned_subject_ids: teacherData.assignedSubjectIds || [],
    });
    const savedTeacher = this._mapTeacherFromApi(response);
    const teachers = this.getTeachers().filter(teacher => teacher.id !== id && teacher.id !== savedTeacher.id);
    teachers.push(savedTeacher);
    Storage.set(Storage.KEYS.TEACHERS, teachers);
    const listRefreshed = await this._refreshTeachersAfterMutation();
    return { ...savedTeacher, refreshWarning: !listRefreshed };
  },

  async deleteTeacher(id) {
    if (!API.hasToken()) {
      throw new Error('A backend login is required to delete teachers. Please sign in again.');
    }
    await API.teachers.delete(id);
    const teachers = this.getTeachers().filter(teacher => teacher.id !== id);
    Storage.set(Storage.KEYS.TEACHERS, teachers);
    const listRefreshed = await this._refreshTeachersAfterMutation();
    return { success: true, refreshWarning: !listRefreshed };
  },

  // --- ATTENDANCE ---
  getAttendance(filters = {}) {
    let records = Storage.get(Storage.KEYS.ATTENDANCE, []);
    if (filters.classId) records = records.filter(r => r.classId === filters.classId);
    if (filters.date) records = records.filter(r => r.date === filters.date);
    if (filters.studentId) records = records.filter(r => r.studentId === filters.studentId);
    if (filters.status) records = records.filter(r => r.status === filters.status);
    return records;
  },

  saveAttendanceBatch(classId, date, teacherId, studentStatusMap) {
    if (!this._checkPermission('attendance', 'add') && !this._checkPermission('attendance', 'edit')) {
      return { success: false, reason: 'Permission denied: You do not have authority to save attendance.' };
    }
    const user = this._getActiveSessionUser();
    const isAdmin = Permissions.isAdmin(user);

    let records = Storage.get(Storage.KEYS.ATTENDANCE, []);
    const now = new Date().toISOString();

    // Check if attendance for this class and date already exists
    const existing = records.filter(r => r.classId === classId && r.date === date);
    
    // Remove existing records for this class & date to prevent duplicates
    records = records.filter(r => !(r.classId === classId && r.date === date));

    // Create new records (Teachers can never mark Excused)
    Object.keys(studentStatusMap).forEach(studentId => {
      let status = studentStatusMap[studentId];
      if (!isAdmin && status === 'Excused') status = 'Absent';
      records.push({
        id: Storage.uuid('att'),
        studentId,
        classId,
        teacherId: teacherId || '',
        date,
        status,
        recordedAt: now
      });
    });

    Storage.set(Storage.KEYS.ATTENDANCE, records);
    return { success: true, count: Object.keys(studentStatusMap).length, wasUpdate: existing.length > 0 };
  },

  updateAttendanceRecord(id, newStatus, excusedReason = '') {
    const user = this._getActiveSessionUser();
    if (user && !Permissions.isAdmin(user)) return false;

    const records = Storage.get(Storage.KEYS.ATTENDANCE, []);
    const index = records.findIndex(r => r.id === id);
    if (index === -1) return false;

    records[index].status = newStatus;
    if (newStatus === 'Excused') {
      records[index].excusedReason = excusedReason;
    } else {
      delete records[index].excusedReason;
    }
    records[index].updatedAt = new Date().toISOString();
    Storage.set(Storage.KEYS.ATTENDANCE, records);
    return records[index];
  },

  // --- EXAMINATIONS & MARKS ---
  _getRawExaminations(filters = {}) {
    let exams = Storage.get(Storage.KEYS.EXAMINATIONS, []);
    if (filters.classId) exams = exams.filter(e => e.classId === filters.classId);
    if (filters.examType) exams = exams.filter(e => e.examType === filters.examType);
    if (filters.academicYear) exams = exams.filter(e => e.academicYear === filters.academicYear);
    if (filters.term) exams = exams.filter(e => e.term === filters.term);
    return exams;
  },

  getExaminations(filters = {}, requestingUser = null) {
    const user = requestingUser || this._getActiveSessionUser();
    const rawExams = this._getRawExaminations(filters);

    if (!user || Permissions.isAdmin(user)) {
      if (user && !Permissions.hasPermission(user, 'examinations', 'view')) {
        return [];
      }
      return rawExams;
    }

    // Strict Teacher Isolation: require examinations.view, assigned class, and assigned subject(s)
    if (!Permissions.hasPermission(user, 'examinations', 'view')) {
      return [];
    }

    const assignedClassIds = Permissions.getTeacherAssignedClassIds(user);
    const assignedSubjectIds = Permissions.getTeacherAssignedSubjectIds(user);

    // Reject explicit unauthorized class request immediately
    if (filters.classId && !assignedClassIds.includes(filters.classId)) {
      return [];
    }

    const allSubjects = this.getSubjects();
    const sanitized = [];

    rawExams.forEach(exam => {
      if (!assignedClassIds.includes(exam.classId)) return;

      const allowedClassSubjects = allSubjects.filter(
        s => s.classId === exam.classId && assignedSubjectIds.includes(s.id)
      );
      if (allowedClassSubjects.length === 0) return;

      // Reject explicit unauthorized subject request
      if (filters.subjectId && !allowedClassSubjects.some(s => s.id === filters.subjectId)) {
        return;
      }

      const targetSubjects = filters.subjectId
        ? allowedClassSubjects.filter(s => s.id === filters.subjectId)
        : allowedClassSubjects;
      const allowedSubIdSet = new Set(targetSubjects.map(s => s.id));

      // Strip all unassigned subject keys, activity scores, and cross-teacher totals
      const scopedMarks = {};
      if (exam.marks) {
        Object.keys(exam.marks).forEach(stId => {
          const entry = exam.marks[stId];
          if (!entry) return;
          const cleanEntry = {};
          let scopedTotal = 0;

          allowedSubIdSet.forEach(subId => {
            if (entry[subId] !== undefined) {
              cleanEntry[subId] = entry[subId];
              const num = parseFloat(entry[subId]);
              if (!isNaN(num)) scopedTotal += num;
            }
          });
          cleanEntry.total = scopedTotal;
          scopedMarks[stId] = cleanEntry;
        });
      }

      sanitized.push({
        ...exam,
        marks: scopedMarks
      });
    });

    return sanitized;
  },

  saveExaminationRecord(examData, requestingUser = null) {
    const user = requestingUser || this._getActiveSessionUser();
    const canAdd = user ? Permissions.hasPermission(user, 'examinations', 'add') : this._checkPermission('examinations', 'add');
    const canEdit = user ? Permissions.hasPermission(user, 'examinations', 'edit') : this._checkPermission('examinations', 'edit');
    if (!canAdd && !canEdit) {
      return { success: false, authorized: false, error: 'Permission denied: You do not have authority to save examination marks.' };
    }

    if (!examData || !examData.classId || !examData.examType || !examData.academicYear || !examData.term) {
      return { success: false, authorized: false, error: 'Missing required examination parameters.' };
    }

    const isAdmin = !user || Permissions.isAdmin(user);
    const allClassSubjects = this.getSubjectsByClass(examData.classId);
    const classStudentIds = new Set(this.getStudentsByClass(examData.classId).map(s => s.id));

    let allowedSubIdSet = null;
    if (!isAdmin) {
      if (!Permissions.canAccessClassMarks(user, examData.classId)) {
        return { success: false, authorized: false, error: 'Access denied: This class or its subjects are not assigned to you.' };
      }

      const assignedSubs = Permissions.getTeacherAssignedSubjectIds(user);
      const allowedClassSubjects = allClassSubjects.filter(s => assignedSubs.includes(s.id));
      if (allowedClassSubjects.length === 0) {
        return { success: false, authorized: false, error: 'Access denied: No subjects in this class are assigned to you.' };
      }
      allowedSubIdSet = new Set(allowedClassSubjects.map(s => s.id));

      // Validate every student and subject key in the payload before touching storage
      const incomingMarks = examData.marks || {};
      for (const stId of Object.keys(incomingMarks)) {
        if (!classStudentIds.has(stId)) {
          return { success: false, authorized: false, error: `Access denied: Student ${stId} does not belong to your assigned class.` };
        }
        const stuPayload = incomingMarks[stId] || {};
        for (const key of Object.keys(stuPayload)) {
          if (key === 'total') continue;
          if (key === 'activity') {
            if (stuPayload.activity !== null && stuPayload.activity !== undefined && stuPayload.activity !== '') {
              return { success: false, authorized: false, error: 'Access denied: Teachers may only enter marks for assigned subjects.' };
            }
            continue;
          }
          if (!allowedSubIdSet.has(key)) {
            return { success: false, authorized: false, error: `Access denied: Subject ${key} is not assigned to your teaching profile.` };
          }
          const rawVal = stuPayload[key];
          if (rawVal !== null && rawVal !== undefined && rawVal !== '') {
            const num = parseFloat(rawVal);
            const subObj = allowedClassSubjects.find(s => s.id === key);
            const maxVal = subObj ? (parseFloat(subObj.maxMarks) || 100) : 100;
            if (isNaN(num) || num < 0 || num > maxVal) {
              return { success: false, authorized: true, error: `Invalid score for ${subObj ? subObj.name : key}: must be between 0 and ${maxVal}.` };
            }
          }
        }
      }
    }

    const exams = Storage.get(Storage.KEYS.EXAMINATIONS, []);
    // Check if record exists for same class, examType, year, term
    const index = exams.findIndex(e =>
      e.classId === examData.classId &&
      e.examType === examData.examType &&
      e.academicYear === examData.academicYear &&
      e.term === examData.term
    );

    let finalMarks = {};
    if (index !== -1 && exams[index].marks) {
      finalMarks = JSON.parse(JSON.stringify(exams[index].marks));
    }

    Object.keys(examData.marks || {}).forEach(stId => {
      const incoming = examData.marks[stId] || {};
      if (!finalMarks[stId]) {
        finalMarks[stId] = {};
      }
      Object.keys(incoming).forEach(key => {
        if (key === 'total') return;
        if (!isAdmin) {
          if (key === 'activity' || !allowedSubIdSet.has(key)) {
            return;
          }
        }
        finalMarks[stId][key] = incoming[key];
      });

      // Recompute full stored exam total across ALL subjects + activity without altering other teachers' scores
      let total = 0;
      Object.keys(finalMarks[stId]).forEach(k => {
        if (k !== 'total' && k !== 'activity') {
          const val = parseFloat(finalMarks[stId][k]);
          if (!isNaN(val)) total += val;
        }
      });
      if (finalMarks[stId].activity !== null && finalMarks[stId].activity !== undefined && !isNaN(finalMarks[stId].activity)) {
        total += parseFloat(finalMarks[stId].activity);
      }
      finalMarks[stId].total = total;
    });

    const record = {
      id: index !== -1 ? exams[index].id : Storage.uuid('exam'),
      classId: examData.classId,
      examType: examData.examType,
      academicYear: examData.academicYear,
      term: examData.term,
      recordedDate: index !== -1 && exams[index].recordedDate ? exams[index].recordedDate : new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString(),
      marks: finalMarks
    };

    if (index !== -1) {
      exams[index] = record;
    } else {
      exams.push(record);
    }

    Storage.set(Storage.KEYS.EXAMINATIONS, exams);
    return { ...record, success: true, authorized: true };
  },

  // Historical Examination Query preserving historical class & subject isolation
  getStudentHistoricalExams(filters = {}, requestingUser = null) {
    const { studentId, classId, academicYear, term, examType, subjectId } = filters;
    const user = requestingUser || this._getActiveSessionUser();
    const isAdmin = !user || Permissions.isAdmin(user);

    const teacherAssignedClasses = !isAdmin ? Permissions.getTeacherAssignedClassIds(user) : null;
    const teacherAssignedSubjects = !isAdmin ? Permissions.getTeacherAssignedSubjectIds(user) : null;

    if (!isAdmin) {
      if (!Permissions.hasPermission(user, 'examinations', 'view')) return [];
      if (classId && !teacherAssignedClasses.includes(classId)) return [];
      if (subjectId && !teacherAssignedSubjects.includes(subjectId)) return [];
      if (studentId) {
        const st = this.getStudentById(studentId);
        if (st && !teacherAssignedClasses.includes(st.classId)) return [];
      }
    }

    const exams = this.getExaminations({
      classId: classId || undefined,
      academicYear: academicYear || undefined,
      term: term || undefined,
      examType: examType || undefined,
      subjectId: subjectId || undefined
    }, user);

    const classes = this.getClasses();
    const subjects = this.getSubjects();
    const students = this.getStudents();

    const results = [];

    exams.forEach(exam => {
      if (teacherAssignedClasses && !teacherAssignedClasses.includes(exam.classId)) return;
      if (!exam.marks) return;

      const cls = classes.find(c => c.id === exam.classId);
      let examSubjects = subjects.filter(s => s.classId === exam.classId);
      if (teacherAssignedSubjects) {
        examSubjects = examSubjects.filter(s => teacherAssignedSubjects.includes(s.id));
      }
      if (subjectId) {
        examSubjects = examSubjects.filter(s => s.id === subjectId);
      }
      if (!isAdmin && examSubjects.length === 0) return;

      // Build ranking map for this historical exam if Admin
      const rankingList = [];
      if (isAdmin) {
        Object.keys(exam.marks).forEach(stId => {
          const m = exam.marks[stId];
          rankingList.push({ studentId: stId, total: parseFloat(m.total) || 0 });
        });
        rankingList.sort((a, b) => b.total - a.total);
        let rank = 1;
        for (let i = 0; i < rankingList.length; i++) {
          if (i > 0 && rankingList[i].total === rankingList[i - 1].total) {
            rankingList[i].position = rankingList[i - 1].position;
          } else {
            rankingList[i].position = rank;
          }
          rank++;
        }
      }

      const targetStudentIds = studentId ? (exam.marks[studentId] ? [studentId] : []) : Object.keys(exam.marks);

      targetStudentIds.forEach(stId => {
        const student = students.find(s => s.id === stId);
        const markEntry = exam.marks[stId];
        if (!markEntry) return;

        const subjectRows = [];
        let scopedTotal = 0;
        let maxPossibleTotal = 0;

        examSubjects.forEach(sub => {
          const rawScore = markEntry[sub.id];
          const hasScore = rawScore !== undefined && rawScore !== null && rawScore !== '';
          const scoreVal = hasScore ? parseFloat(rawScore) : null;
          if (scoreVal !== null && !isNaN(scoreVal)) {
            scopedTotal += scoreVal;
          }
          maxPossibleTotal += (parseFloat(sub.maxMarks) || 100);
          subjectRows.push({
            subjectId: sub.id,
            subjectName: sub.name,
            subjectCode: sub.code || '',
            maxMarks: sub.maxMarks || 100,
            score: scoreVal
          });
        });

        const includeActivity = isAdmin && !subjectId && markEntry.activity !== null && markEntry.activity !== undefined && !isNaN(markEntry.activity);
        const activityScore = includeActivity ? parseFloat(markEntry.activity) : null;
        if (activityScore !== null && isAdmin) {
          scopedTotal += activityScore;
        }

        const totalMarks = isAdmin && !subjectId ? (markEntry.total !== undefined ? markEntry.total : scopedTotal) : scopedTotal;
        const posObj = isAdmin ? rankingList.find(r => r.studentId === stId) : null;

        if (subjectRows.length === 0 && subjectId) return;

        results.push({
          examId: exam.id,
          studentId: stId,
          studentName: student ? student.fullName : stId,
          historicalClassId: exam.classId,
          historicalClassName: cls ? cls.name : exam.classId,
          academicYear: exam.academicYear,
          term: exam.term,
          examType: exam.examType,
          recordedDate: exam.recordedDate || '',
          subjectRows,
          activityScore: isAdmin ? activityScore : null,
          totalMarks,
          maxPossibleTotal,
          position: posObj ? posObj.position : null
        });
      });
    });

    return results;
  },

  // --- RESULTS & RANKING ---
  calculateRankings(classId, academicYear, term, requestingUser = null) {
    const user = requestingUser || this._getActiveSessionUser();
    const isAdmin = !user || Permissions.isAdmin(user);
    const teacherAssignedSubs = !isAdmin ? Permissions.getTeacherAssignedSubjectIds(user) : null;
    const teacherAssignedClasses = !isAdmin ? Permissions.getTeacherAssignedClassIds(user) : null;

    if (teacherAssignedClasses && !teacherAssignedClasses.includes(classId)) {
      return { results: [], midtermExists: false, finalExists: false, classId, academicYear, term };
    }

    const students = this.getStudentsByClass(classId);
    const settings = this.getSettings();
    const classSubjects = this.getSubjectsByClass(classId);
    const scopedSubjects = teacherAssignedSubs
      ? classSubjects.filter(s => teacherAssignedSubs.includes(s.id))
      : classSubjects;

    if (!isAdmin && scopedSubjects.length === 0) {
      return { results: [], midtermExists: false, finalExists: false, classId, academicYear, term };
    }

    // Fetch Midterm and Final
    const exams = this.getExaminations({ classId, academicYear, term }, user);
    const midterm = exams.find(e => e.examType === 'Midterm');
    const finalExam = exams.find(e => e.examType === 'Final');

    const computeScopedTotal = (record) => {
      if (!record) return null;
      if (isAdmin && record.total !== undefined && record.total !== null) {
        return parseFloat(record.total) || 0;
      }
      let sum = 0;
      let found = false;
      scopedSubjects.forEach(sub => {
        const val = record[sub.id];
        if (val !== undefined && val !== null && val !== '') {
          sum += parseFloat(val) || 0;
          found = true;
        }
      });
      return found ? sum : null;
    };

    const results = students.map(student => {
      const midRecord = midterm && midterm.marks ? midterm.marks[student.id] : null;
      const finRecord = finalExam && finalExam.marks ? finalExam.marks[student.id] : null;

      const midTotal = computeScopedTotal(midRecord);
      const finTotal = computeScopedTotal(finRecord);

      let combinedTotal = 0;
      let hasScores = false;

      if (midTotal !== null && finTotal !== null) {
        hasScores = true;
        if (settings.resultCalcMethod === 'sum') {
          combinedTotal = midTotal + finTotal;
        } else if (settings.resultCalcMethod === 'average') {
          combinedTotal = Math.round(((midTotal + finTotal) / 2) * 10) / 10;
        } else if (settings.resultCalcMethod === 'weighted') {
          const wMid = (settings.weightedMidterm || 40) / 100;
          const wFin = (settings.weightedFinal || 60) / 100;
          combinedTotal = Math.round((midTotal * wMid + finTotal * wFin) * 10) / 10;
        } else {
          combinedTotal = midTotal + finTotal;
        }
      } else if (midTotal !== null) {
        hasScores = true;
        combinedTotal = midTotal;
      } else if (finTotal !== null) {
        hasScores = true;
        combinedTotal = finTotal;
      }

      return {
        studentId: student.id,
        studentName: student.fullName,
        gender: student.gender,
        midtermTotal: midTotal,
        finalTotal: finTotal,
        combinedTotal: hasScores ? combinedTotal : 0,
        hasScores,
        position: null
      };
    });

    // Sort by combined total descending (Admin gets full class ranking; Teachers get student name / scoped total order without full-class position)
    results.sort((a, b) => b.combinedTotal - a.combinedTotal);

    if (isAdmin) {
      let currentRank = 1;
      for (let i = 0; i < results.length; i++) {
        if (!results[i].hasScores) {
          results[i].position = null;
          continue;
        }
        if (i > 0 && results[i - 1].hasScores && results[i].combinedTotal === results[i - 1].combinedTotal) {
          results[i].position = results[i - 1].position;
        } else {
          results[i].position = currentRank;
        }
        currentRank++;
      }
    }

    return {
      results,
      midtermExists: !!midterm,
      finalExists: !!finalExam,
      classId,
      academicYear,
      term
    };
  },

  // --- PROMOTION ---
  checkPromotionEligibility(classId, academicYear, term) {
    const finalExam = this._getRawExaminations({ classId, examType: 'Final', academicYear, term });
    const hasFinalExam = finalExam && finalExam.length > 0;
    return {
      eligible: hasFinalExam,
      message: hasFinalExam 
        ? 'Final examination marks are registered. Class is eligible for promotion.'
        : 'Final Examination has not been registered yet.'
    };
  },

  promoteStudents(studentIds, currentClassId, destinationClassId, academicYear, promotedBy = 'Admin') {
    const students = this.getStudents();
    const promotions = Storage.get(Storage.KEYS.PROMOTIONS, []);
    const today = new Date().toISOString().split('T')[0];

    let count = 0;
    studentIds.forEach(studentId => {
      const student = students.find(s => s.id === studentId);
      if (student && student.classId === currentClassId) {
        const prevClassId = student.classId;
        student.classId = destinationClassId;
        count++;

        // Record history
        promotions.push({
          id: Storage.uuid('prm'),
          studentId,
          previousClassId: prevClassId,
          newClassId: destinationClassId,
          academicYear,
          promotedDate: today,
          promotedBy
        });
      }
    });

    Storage.set(Storage.KEYS.STUDENTS, students);
    Storage.set(Storage.KEYS.PROMOTIONS, promotions);
    return { success: true, count };
  },

  getPromotionHistory(studentId = null) {
    const history = Storage.get(Storage.KEYS.PROMOTIONS, []);
    if (studentId) return history.filter(h => h.studentId === studentId);
    return history;
  },

  // --- FEES & PAYMENTS ---
  /**
   * Returns CONFIRMED payments only.
   * PENDING and FAILED payments are excluded from all balance calculations and ledger views.
   * To show all payments including pending/failed, use getAllPayments().
   */
  getPayments(filters = {}) {
    const user = this._getActiveSessionUser();
    if (user && !Permissions.canAccessFinances(user)) return [];
    return PaymentSyncEngine.getConfirmedPayments(filters);
  },

  /**
   * Returns ALL payments regardless of sync status (for transaction history display).
   * PENDING payments are tagged syncStatus='PENDING', FAILED payments syncStatus='FAILED'.
   */
  getAllPayments(filters = {}) {
    const user = this._getActiveSessionUser();
    if (user && !Permissions.canAccessFinances(user)) return [];
    return PaymentSyncEngine.getAllPayments(filters);
  },

  getInvoices(studentId = null) {
    const user = this._getActiveSessionUser();
    if (user && !Permissions.canAccessFinances(user)) return [];
    const invoices = Storage.get(Storage.KEYS.INVOICES, []);
    if (studentId) return invoices.filter(inv => inv.student === studentId || inv.student_id === studentId || inv.studentId === studentId);
    return invoices;
  },

  getFeeStructures() {
    const user = this._getActiveSessionUser();
    if (user && !Permissions.canAccessFinances(user)) return [];
    return Storage.get(Storage.KEYS.FEE_STRUCTURES, []);
  },

  async reversePayment(paymentId, reason) {
    if (!this._checkPermission('payments', 'edit')) return null;
    if (API && API.hasToken()) {
      try {
        const rev = await API.finances.payments.reverse(paymentId, reason);
        await this.syncFromBackend();
        return rev;
      } catch (err) {
        console.warn('API reverse payment failed:', err);
        throw err;
      }
    }
    return null;
  },

  async refundPayment(paymentId, amount, reason) {
    if (!this._checkPermission('payments', 'edit')) return null;
    if (API && API.hasToken()) {
      try {
        const ref = await API.finances.payments.refund(paymentId, amount, reason);
        await this.syncFromBackend();
        return ref;
      } catch (err) {
        console.warn('API refund payment failed:', err);
        throw err;
      }
    }
    return null;
  },

  /**
   * Records a payment via the PaymentSyncEngine.
   *
   * Returns { localRecord, confirmationPromise }.
   * - localRecord is immediately available with syncStatus=PENDING.
   * - confirmationPromise resolves to the CONFIRMED record once the backend responds.
   * - On backend rejection, the promise rejects and the local record is marked FAILED.
   *
   * IMPORTANT: Only call this via PaymentsView which awaits confirmationPromise before
   * showing success toast or receipt modal.
   */
  async recordPayment(paymentData) {
    if (!this._checkPermission('payments', 'add')) {
      throw new Error('You do not have permission to record payments.');
    }
    if (!paymentData.idempotencyKey) {
      paymentData.idempotencyKey = Storage.uuid('idem');
    }
    return PaymentSyncEngine.submitPayment(paymentData);
  },

  /**
   * Recovers any PENDING payments from a previous session.
   * Called by app.js after login/session refresh.
   */
  async recoverPendingPayments() {
    if (!this._checkPermission('payments', 'add')) return [];
    return PaymentSyncEngine.recoverPending();
  },

  // --- INCOME & EXPENSES MANAGEMENT (ADMIN ONLY) ---
  getIncomes(filters = {}) {
    const user = this._getActiveSessionUser();
    if (user && !Permissions.canAccessFinances(user)) return [];
    let items = Storage.get(Storage.KEYS.INCOMES, []);
    if (filters.category) items = items.filter(i => i.category === filters.category);
    if (filters.paymentMethod) items = items.filter(i => i.paymentMethod === filters.paymentMethod);
    if (filters.startDate) items = items.filter(i => i.date >= filters.startDate);
    if (filters.endDate) items = items.filter(i => i.date <= filters.endDate);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      items = items.filter(i =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q) ||
        (i.referenceNumber || '').toLowerCase().includes(q)
      );
    }
    return items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  },

  addIncome(incomeData) {
    if (!this._checkPermission('payments', 'add')) return null;
    const incomes = Storage.get(Storage.KEYS.INCOMES, []);
    const newInc = {
      id: Storage.uuid('inc'),
      title: (incomeData.title || '').trim(),
      category: (incomeData.category || 'Other Income').trim(),
      description: (incomeData.description || '').trim(),
      amount: Math.max(0, parseFloat(incomeData.amount) || 0),
      paymentMethod: incomeData.paymentMethod || 'Cash',
      date: incomeData.date || new Date().toISOString().split('T')[0],
      referenceNumber: (incomeData.referenceNumber || '').trim() || `INC-${Date.now().toString().slice(-6)}`,
      notes: (incomeData.notes || '').trim(),
      createdAt: new Date().toISOString()
    };
    incomes.unshift(newInc);
    Storage.set(Storage.KEYS.INCOMES, incomes);
    return newInc;
  },

  updateIncome(id, incomeData) {
    if (!this._checkPermission('payments', 'edit')) return null;
    const incomes = Storage.get(Storage.KEYS.INCOMES, []);
    const idx = incomes.findIndex(i => i.id === id);
    if (idx === -1) return null;
    incomes[idx] = {
      ...incomes[idx],
      title: (incomeData.title || '').trim(),
      category: (incomeData.category || 'Other Income').trim(),
      description: (incomeData.description || '').trim(),
      amount: Math.max(0, parseFloat(incomeData.amount) || 0),
      paymentMethod: incomeData.paymentMethod || incomes[idx].paymentMethod,
      date: incomeData.date || incomes[idx].date,
      referenceNumber: (incomeData.referenceNumber || '').trim(),
      notes: (incomeData.notes || '').trim(),
      updatedAt: new Date().toISOString()
    };
    Storage.set(Storage.KEYS.INCOMES, incomes);
    return incomes[idx];
  },

  deleteIncome(id) {
    if (!this._checkPermission('payments', 'delete')) return false;
    let incomes = Storage.get(Storage.KEYS.INCOMES, []);
    const exists = incomes.some(i => i.id === id);
    if (!exists) return false;
    incomes = incomes.filter(i => i.id !== id);
    Storage.set(Storage.KEYS.INCOMES, incomes);
    return true;
  },

  getExpenses(filters = {}) {
    const user = this._getActiveSessionUser();
    if (user && !Permissions.canAccessFinances(user)) return [];
    let items = Storage.get(Storage.KEYS.EXPENSES, []);
    if (filters.category) items = items.filter(i => i.category === filters.category);
    if (filters.paymentMethod) items = items.filter(i => i.paymentMethod === filters.paymentMethod);
    if (filters.startDate) items = items.filter(i => i.date >= filters.startDate);
    if (filters.endDate) items = items.filter(i => i.date <= filters.endDate);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      items = items.filter(i =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q) ||
        (i.referenceNumber || '').toLowerCase().includes(q)
      );
    }
    return items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  },

  addExpense(expenseData) {
    if (!this._checkPermission('payments', 'add')) return null;
    const expenses = Storage.get(Storage.KEYS.EXPENSES, []);
    const newExp = {
      id: Storage.uuid('exp'),
      title: (expenseData.title || '').trim(),
      category: (expenseData.category || 'Operations').trim(),
      description: (expenseData.description || '').trim(),
      amount: Math.max(0, parseFloat(expenseData.amount) || 0),
      paymentMethod: expenseData.paymentMethod || 'Cash',
      date: expenseData.date || new Date().toISOString().split('T')[0],
      referenceNumber: (expenseData.referenceNumber || '').trim() || `EXP-${Date.now().toString().slice(-6)}`,
      notes: (expenseData.notes || '').trim(),
      createdAt: new Date().toISOString()
    };
    expenses.unshift(newExp);
    Storage.set(Storage.KEYS.EXPENSES, expenses);
    return newExp;
  },

  updateExpense(id, expenseData) {
    if (!this._checkPermission('payments', 'edit')) return null;
    const expenses = Storage.get(Storage.KEYS.EXPENSES, []);
    const idx = expenses.findIndex(i => i.id === id);
    if (idx === -1) return null;
    expenses[idx] = {
      ...expenses[idx],
      title: (expenseData.title || '').trim(),
      category: (expenseData.category || 'Operations').trim(),
      description: (expenseData.description || '').trim(),
      amount: Math.max(0, parseFloat(expenseData.amount) || 0),
      paymentMethod: expenseData.paymentMethod || expenses[idx].paymentMethod,
      date: expenseData.date || expenses[idx].date,
      referenceNumber: (expenseData.referenceNumber || '').trim(),
      notes: (expenseData.notes || '').trim(),
      updatedAt: new Date().toISOString()
    };
    Storage.set(Storage.KEYS.EXPENSES, expenses);
    return expenses[idx];
  },

  deleteExpense(id) {
    if (!this._checkPermission('payments', 'delete')) return false;
    let expenses = Storage.get(Storage.KEYS.EXPENSES, []);
    const exists = expenses.some(i => i.id === id);
    if (!exists) return false;
    expenses = expenses.filter(i => i.id !== id);
    Storage.set(Storage.KEYS.EXPENSES, expenses);
    return true;
  },

  getFinancialOverview(filters = {}) {
    const user = this._getActiveSessionUser();
    if (user && !Permissions.canAccessFinances(user)) {
      return {
        studentFeeCollections: 0,
        otherIncome: 0,
        totalIncome: 0,
        totalExpenses: 0,
        netBalance: 0,
        paymentsCount: 0,
        incomesCount: 0,
        expensesCount: 0
      };
    }

    let payments = this.getPayments();
    if (filters.month) payments = payments.filter(p => p.month === filters.month);
    if (filters.startDate) payments = payments.filter(p => p.paymentDate >= filters.startDate);
    if (filters.endDate) payments = payments.filter(p => p.paymentDate <= filters.endDate);
    if (filters.paymentMethod) payments = payments.filter(p => p.paymentMethod === filters.paymentMethod);

    const incomes = this.getIncomes(filters);
    const expenses = this.getExpenses(filters);

    // Strictly prevent double-counting: studentFeeCollections comes from payments, otherIncome comes from incomes
    // Reversals and refunds are deducted in accordance with Stage 3.7 & Stage 3.9 financial rules
    const grossPayments = payments
      .filter(p => !p.transactionType || p.transactionType.toUpperCase() === 'PAYMENT')
      .reduce((sum, p) => sum + (parseFloat(p.amountPaid) || 0), 0);
    const totalReversals = payments
      .filter(p => p.transactionType && p.transactionType.toUpperCase() === 'REVERSAL')
      .reduce((sum, p) => sum + (parseFloat(p.amountPaid) || 0), 0);
    const totalRefunds = payments
      .filter(p => p.transactionType && p.transactionType.toUpperCase() === 'REFUND')
      .reduce((sum, p) => sum + (parseFloat(p.amountPaid) || 0), 0);
    const studentFeeCollections = Math.max(0, grossPayments - totalReversals - totalRefunds);

    const otherIncome = incomes.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
    const totalIncome = studentFeeCollections + otherIncome;
    const totalExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const netBalance = totalIncome - totalExpenses;

    return {
      studentFeeCollections,
      grossPayments,
      totalReversals,
      totalRefunds,
      otherIncome,
      totalIncome,
      totalExpenses,
      netBalance,
      paymentsCount: payments.length,
      incomesCount: incomes.length,
      expensesCount: expenses.length
    };
  },

  // Computes the comprehensive fee status for every student
  getStudentFeeLedger(monthFilter = null) {
    const user = this._getActiveSessionUser();
    if (user && !Permissions.canAccessFinances(user)) return [];
    const students = this.getStudents();
    const payments = this.getPayments();
    const settings = this.getSettings();
    const classes = this.getClasses();

    const targetMonth = monthFilter || new Date().toISOString().slice(0, 7); // YYYY-MM

    const classFeeAmount = settings.classFeeMonthly || 45;
    const schoolFeeAmount = settings.schoolFeeMonthly || 35;
    const totalObligation = classFeeAmount + schoolFeeAmount;

    return students.map(student => {
      const cls = classes.find(c => c.id === student.classId);
      // Filter payments for this student and target month
      const studentPayments = payments.filter(p => p.studentId === student.id && (!targetMonth || p.month === targetMonth));

      // Class fee payments (net of reversals and refunds)
      const classFeeGross = studentPayments
        .filter(p => p.feeCategory === 'Class Fee' && (!p.transactionType || p.transactionType.toUpperCase() === 'PAYMENT'))
        .reduce((sum, p) => sum + (parseFloat(p.amountPaid) || 0), 0);
      const classFeeDeductions = studentPayments
        .filter(p => p.feeCategory === 'Class Fee' && p.transactionType && (p.transactionType.toUpperCase() === 'REVERSAL' || p.transactionType.toUpperCase() === 'REFUND'))
        .reduce((sum, p) => sum + (parseFloat(p.amountPaid) || 0), 0);
      const classFeePaid = Math.max(0, classFeeGross - classFeeDeductions);

      // School fee payments (net of reversals and refunds)
      const schoolFeeGross = studentPayments
        .filter(p => p.feeCategory === 'School Fee' && (!p.transactionType || p.transactionType.toUpperCase() === 'PAYMENT'))
        .reduce((sum, p) => sum + (parseFloat(p.amountPaid) || 0), 0);
      const schoolFeeDeductions = studentPayments
        .filter(p => p.feeCategory === 'School Fee' && p.transactionType && (p.transactionType.toUpperCase() === 'REVERSAL' || p.transactionType.toUpperCase() === 'REFUND'))
        .reduce((sum, p) => sum + (parseFloat(p.amountPaid) || 0), 0);
      const schoolFeePaid = Math.max(0, schoolFeeGross - schoolFeeDeductions);

      const totalPaid = classFeePaid + schoolFeePaid;
      const outstanding = Math.max(0, totalObligation - totalPaid);

      // Determine statuses
      const getClassFeeStatus = (paid, due) => {
        if (paid >= due) return 'Paid';
        if (paid > 0) return 'Partially Paid';
        return 'Unpaid';
      };

      const getSchoolFeeStatus = (paid, due) => {
        if (paid >= due) return 'Paid';
        if (paid > 0) return 'Partially Paid';
        return 'Unpaid';
      };

      return {
        studentId: student.id,
        studentName: student.fullName,
        className: cls ? cls.name : 'Unassigned',
        classId: student.classId,
        parentPhone: student.parentPhone,
        targetMonth,
        classFeeDue: classFeeAmount,
        classFeePaid,
        classFeeStatus: getClassFeeStatus(classFeePaid, classFeeAmount),
        schoolFeeDue: schoolFeeAmount,
        schoolFeePaid,
        schoolFeeStatus: getSchoolFeeStatus(schoolFeePaid, schoolFeeAmount),
        totalDue: totalObligation,
        totalPaid,
        outstandingBalance: outstanding,
        status: totalPaid >= totalObligation ? 'Paid' : (totalPaid > 0 ? 'Partially Paid' : 'Unpaid'),
        transactions: studentPayments
      };
    });
  },

  // --- USERS ---
  getUsers() {
    return Storage.get(Storage.KEYS.USERS, []);
  },

  getUserByEmail(email) {
    const users = this.getUsers();
    return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  },

  addUser(userData) {
    const users = this.getUsers();
    const existing = users.find(u => u.email.toLowerCase() === userData.email.trim().toLowerCase());
    if (existing) {
      return { success: false, reason: 'A user with this email address already exists.' };
    }

    const newUser = {
      id: Storage.uuid('usr'),
      fullName: userData.fullName.trim(),
      email: userData.email.trim().toLowerCase(),
      password: userData.password || 'User123!',
      role: userData.role, // 'ADMIN' or 'TEACHER'
      teacherId: userData.teacherId || '',
      status: userData.status || 'Active',
      permissions: userData.permissions || Permissions.getDefaultPermissions(userData.role),
      createdAt: new Date().toISOString().split('T')[0]
    };
    users.push(newUser);
    Storage.set(Storage.KEYS.USERS, users);
    return { success: true, user: newUser };
  },

  updateUser(id, userData) {
    const users = this.getUsers();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return null;

    users[index] = {
      ...users[index],
      fullName: (userData.fullName || users[index].fullName).trim(),
      email: (userData.email || users[index].email).trim().toLowerCase(),
      role: userData.role || users[index].role,
      status: userData.status || users[index].status,
      teacherId: userData.teacherId !== undefined ? userData.teacherId : users[index].teacherId
    };
    if (userData.permissions) {
      users[index].permissions = userData.permissions;
    }
    if (userData.password) {
      users[index].password = userData.password;
    }
    Storage.set(Storage.KEYS.USERS, users);
    return users[index];
  },

  resetUserPassword(id, newPassword = 'Password123!') {
    const users = this.getUsers();
    const user = users.find(u => u.id === id);
    if (user) {
      user.password = newPassword;
      Storage.set(Storage.KEYS.USERS, users);
      return true;
    }
    return false;
  },

  // --- SETTINGS ---
  getSettings() {
    return Storage.get(Storage.KEYS.SETTINGS, {
      institutionName: 'MADARASATUL AL-IMAAM',
      institutionLogo: '/assets/aistudio/image_6159b039.png',
      contactPhone: '063-4129440',
      contactEmail: 'admin@alimaama.demo',
      address: 'Hargeisa, Somaliland',
      academicYear: '2026-2027',
      currentTerm: 'Term 1',
      classFeeMonthly: 45,
      schoolFeeMonthly: 35,
      currencySymbol: '$',
      resultCalcMethod: 'sum',
      weightedMidterm: 40,
      weightedFinal: 60
    });
  },

  updateSettings(newSettings) {
    const current = this.getSettings();
    const updated = { ...current, ...newSettings };
    Storage.set(Storage.KEYS.SETTINGS, updated);
    if (API && API.hasToken()) {
      API.settings.patch(newSettings).catch(err => console.warn('Sync settings patch error:', err));
    }
    return updated;
  },

  // --- DASHBOARD METRICS ---
  getDashboardMetrics() {
    const students = this.getStudents();
    const teachers = this.getTeachers();
    const classes = this.getClasses();
    const today = new Date().toISOString().split('T')[0];
    const todayAttendance = this.getAttendance({ date: today });
    const ledger = this.getStudentFeeLedger();
    const payments = this.getPayments();

    const totalStudents = students.length;
    const totalTeachers = teachers.length;
    const totalClasses = classes.length;

    // Attendance calculation
    const presentCount = todayAttendance.filter(a => a.status === 'Present').length;
    const absentCount = todayAttendance.filter(a => a.status === 'Absent').length;
    const excusedCount = todayAttendance.filter(a => a.status === 'Excused').length;
    const totalAttendanceRecorded = todayAttendance.length;
    const attendancePercentage = totalAttendanceRecorded > 0 
      ? Math.round((presentCount / totalAttendanceRecorded) * 100) 
      : 0; // 0% if no attendance taken today (never fictitious baseline)

    // Fees calculations
    const monthlyFeesCollected = ledger.reduce((sum, item) => sum + item.totalPaid, 0);
    const outstandingFees = ledger.reduce((sum, item) => sum + item.outstandingBalance, 0);
    const totalFeeObligation = ledger.reduce((sum, item) => sum + item.totalDue, 0);

    // Class distribution
    const classDistribution = classes.map(cls => ({
      classId: cls.id,
      className: cls.name,
      studentCount: students.filter(s => s.classId === cls.id).length
    }));

    return {
      totalStudents,
      totalTeachers,
      totalClasses,
      attendancePercentage,
      attendanceToday: {
        present: presentCount,
        absent: absentCount,
        excused: excusedCount,
        total: totalAttendanceRecorded
      },
      monthlyFeesCollected,
      outstandingFees,
      totalFeeObligation,
      classDistribution,
      recentStudents: [...students].reverse().slice(0, 5),
      recentTransactions: [...payments].slice(0, 5),
      recentAttendance: [...todayAttendance].reverse().slice(0, 5)
    };
  },

  async syncFromBackend() {
    if (!API || !API.hasToken()) return false;
    try {
      // 1. Settings
      try {
        const settings = await API.settings.get();
        if (settings && typeof settings === 'object') {
          Storage.set(Storage.KEYS.SETTINGS, { ...Storage.get(Storage.KEYS.SETTINGS, {}), ...settings });
        }
      } catch (err) {
        // Continue if module fails
      }

      // 2. Classes
      try {
        const classesRes = await API.classes.list();
        const classes = Array.isArray(classesRes) ? classesRes : (classesRes.results || []);
        const mapped = classes.map(c => ({
          id: c.id,
          name: c.name,
          section: c.section || 'A',
          room: c.room || '',
          capacity: c.capacity || 30,
          teacherId: c.teacher || c.teacher_id || c.teacherId || '',
          academicYear: c.academic_year || c.academicYear || '2026-2027',
          status: c.status || 'ACTIVE'
        }));
        Storage.set(Storage.KEYS.CLASSES, mapped);
      } catch (err) {}

      // 3. Subjects
      try {
        await this.syncSubjectsFromBackend();
      } catch (err) {
        console.warn('Could not load subjects from the backend:', err);
      }

      // 4. Teachers
      try {
        await this.syncTeachersFromBackend();
      } catch (err) {
        console.warn('Could not load teachers from the backend:', err);
      }

      // 5. Students
      try {
        const studentsRes = await API.students.list();
        const students = Array.isArray(studentsRes) ? studentsRes : (studentsRes.results || []);
        const mapped = students.map(s => ({
          id: s.id,
          admissionNumber: s.admission_number || s.studentId || s.id,
          fullName: s.full_name || s.fullName || '',
          gender: s.gender || 'Male',
          dateOfBirth: s.date_of_birth || s.dateOfBirth || '',
          parentPhone: s.parent_phone || s.parentPhone || '',
          classId: s.classroom || s.classId || s.classroom_id || '',
          registrationDate: s.registration_date || s.registrationDate || '',
          status: s.status || 'Active'
        }));
        Storage.set(Storage.KEYS.STUDENTS, mapped);
      } catch (err) {
        console.warn('Could not load students from the backend:', err);
      }

      // 6. Attendance (Stage 3.9)
      try {
        const attRes = await API.attendance.list();
        const attList = Array.isArray(attRes) ? attRes : (attRes.results || []);
        const mapped = attList.map(a => ({
          id: a.id,
          studentId: a.studentId || a.student || a.student_id,
          classId: a.classId || a.classroom || a.classroom_id,
          date: a.date,
          status: a.status,
          excusedReason: a.excusedReason || a.excused_reason || ''
        }));
        Storage.set(Storage.KEYS.ATTENDANCE, mapped);
      } catch (err) {}

      // 7. Examinations (Stage 3.9)
      try {
        const examRes = await API.examinations.list();
        const examList = Array.isArray(examRes) ? examRes : (examRes.results || []);
        const mapped = examList.map(e => {
          const marks = {};
          (Array.isArray(e.marks) ? e.marks : []).forEach(mark => {
            const studentId = mark.studentId || mark.student || mark.student_id;
            const subjectId = mark.subjectId || mark.subject || mark.subject_id;
            if (!studentId || !subjectId) return;
            marks[studentId] ||= {};
            marks[studentId][subjectId] = Number(mark.score);
          });
          return {
            id: e.id,
            classId: e.classId || e.classroom || e.classroom_id,
            examType: e.examType || e.exam_type,
            academicYear: e.academicYear || e.academic_year,
            term: e.term,
            recordedDate: e.recordedDate || e.recorded_date,
            marks
          };
        });
        Storage.set(Storage.KEYS.EXAMINATIONS, mapped);
      } catch (err) {}

      // 8. Finances (if authorized)
      const user = this._getActiveSessionUser();
      if (!user || Permissions.canAccessFinances(user)) {
        try {
          const invoicesRes = await API.finances.invoices.list();
          const invoices = Array.isArray(invoicesRes) ? invoicesRes : (invoicesRes.results || []);
          Storage.set(Storage.KEYS.INVOICES, invoices);
        } catch (e) {}

        try {
          const feeRes = await API.finances.feeStructures.list();
          const fees = Array.isArray(feeRes) ? feeRes : (feeRes.results || []);
          Storage.set(Storage.KEYS.FEE_STRUCTURES, fees);
        } catch (e) {}

        try {
          const paymentsRes = await API.finances.payments.list();
          const payments = Array.isArray(paymentsRes) ? paymentsRes : (paymentsRes.results || []);
          if (payments.length > 0) {
            const mapped = payments.map(p => ({
              id: p.id,
              studentId: p.student || p.student_id || p.studentId,
              feeCategory: p.fee_category || p.feeCategory || 'Tuition Fee',
              month: p.month || '',
              amountDue: parseFloat(p.amount_due || 0),
              amountPaid: parseFloat(p.amount_paid || p.amountPaid || p.amount || 0),
              paymentMethod: p.payment_method || p.paymentMethod || 'Cash',
              paymentDate: p.payment_date || p.paymentDate || '',
              transactionRef: p.transaction_ref || p.receipt_number || '',
              receiptNumber: p.receipt_number || '',
              invoiceId: p.invoice || p.invoice_id || null,
              transactionType: p.transaction_type || 'PAYMENT',
              syncStatus: p.sync_status || 'CONFIRMED',
              recordedBy: p.recorded_by_name || p.recordedBy || 'Administrator',
              notes: p.notes || ''
            }));
            Storage.set(Storage.KEYS.PAYMENTS, mapped);
          }
        } catch (e) {}

        try {
          const incomesRes = await API.finances.incomes.list();
          const incomes = Array.isArray(incomesRes) ? incomesRes : (incomesRes.results || []);
          if (incomes.length > 0) {
            const mapped = incomes.map(i => ({
              id: i.id,
              title: i.title,
              category: i.category,
              description: i.description,
              amount: parseFloat(i.amount || 0),
              paymentMethod: i.payment_method || i.paymentMethod || 'Cash',
              date: i.date,
              referenceNumber: i.reference_number || i.referenceNumber || '',
              notes: i.notes || '',
              createdAt: i.created_at || ''
            }));
            Storage.set(Storage.KEYS.INCOMES, mapped);
          }
        } catch (e) {}

        try {
          const expensesRes = await API.finances.expenses.list();
          const expenses = Array.isArray(expensesRes) ? expensesRes : (expensesRes.results || []);
          if (expenses.length > 0) {
            const mapped = expenses.map(e => ({
              id: e.id,
              title: e.title,
              category: e.category,
              description: e.description,
              amount: parseFloat(e.amount || 0),
              paymentMethod: e.payment_method || e.paymentMethod || 'Cash',
              date: e.date,
              referenceNumber: e.reference_number || e.referenceNumber || '',
              notes: e.notes || '',
              createdAt: e.created_at || ''
            }));
            Storage.set(Storage.KEYS.EXPENSES, mapped);
          }
        } catch (e) {}
      }

      // 7. Users (Admin only)
      if (user && Permissions.isAdmin(user)) {
        try {
          const usersRes = await API.users.list();
          const users = Array.isArray(usersRes) ? usersRes : (usersRes.results || []);
          if (users.length > 0) {
            Storage.set(Storage.KEYS.USERS, users);
          }
        } catch (e) {}
      }

      return true;
    } catch (err) {
      console.warn('syncFromBackend caught exception:', err);
      return false;
    }
  }
};

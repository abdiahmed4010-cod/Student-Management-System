/**
 * AL-IMAAMA - Storage & Persistence Engine
 * Manages LocalStorage collections with schema integrity and default seed datasets.
 */

const STORAGE_KEYS = {
  USERS: 'studently_users',
  STUDENTS: 'studently_students',
  CLASSES: 'studently_classes',
  SUBJECTS: 'studently_subjects',
  TEACHERS: 'studently_teachers',
  ATTENDANCE: 'studently_attendance',
  EXAMINATIONS: 'studently_examinations',
  PAYMENTS: 'studently_payments',
  PROMOTIONS: 'studently_promotions',
  INCOMES: 'studently_incomes',
  EXPENSES: 'studently_expenses',
  SETTINGS: 'studently_settings',
  SESSION: 'studently_session'
};

// Initial Seed Data
function getInitialSeedData() {
  const classes = [
    { id: 'cls-1', name: 'Grade 1', section: 'A', room: 'Room 101', capacity: 30, teacherId: 'tch-1', academicYear: '2026-2027' },
    { id: 'cls-2', name: 'Grade 2', section: 'A', room: 'Room 102', capacity: 30, teacherId: 'tch-1', academicYear: '2026-2027' },
    { id: 'cls-3', name: 'Grade 3', section: 'A', room: 'Room 103', capacity: 30, teacherId: 'tch-2', academicYear: '2026-2027' },
    { id: 'cls-4', name: 'Grade 4', section: 'A', room: 'Room 201', capacity: 30, teacherId: 'tch-2', academicYear: '2026-2027' },
    { id: 'cls-5', name: 'Grade 5', section: 'A', room: 'Room 202', capacity: 30, teacherId: 'tch-3', academicYear: '2026-2027' }
  ];

  const subjects = [
    // Grade 1
    { id: 'sub-1', classId: 'cls-1', name: 'Mathematics', code: 'MATH101', maxMarks: 100 },
    { id: 'sub-2', classId: 'cls-1', name: 'English Language', code: 'ENG101', maxMarks: 100 },
    { id: 'sub-3', classId: 'cls-1', name: 'General Science', code: 'SCI101', maxMarks: 100 },
    { id: 'sub-4', classId: 'cls-1', name: 'Social Studies', code: 'SOC101', maxMarks: 100 },
    { id: 'sub-5', classId: 'cls-1', name: 'Islamic Studies', code: 'ISL101', maxMarks: 100 },
    // Grade 2
    { id: 'sub-6', classId: 'cls-2', name: 'Mathematics', code: 'MATH102', maxMarks: 100 },
    { id: 'sub-7', classId: 'cls-2', name: 'English Language', code: 'ENG102', maxMarks: 100 },
    { id: 'sub-8', classId: 'cls-2', name: 'General Science', code: 'SCI102', maxMarks: 100 },
    { id: 'sub-9', classId: 'cls-2', name: 'Social Studies', code: 'SOC102', maxMarks: 100 },
    { id: 'sub-10', classId: 'cls-2', name: 'Islamic Studies', code: 'ISL102', maxMarks: 100 },
    // Grade 3
    { id: 'sub-11', classId: 'cls-3', name: 'Mathematics', code: 'MATH103', maxMarks: 100 },
    { id: 'sub-12', classId: 'cls-3', name: 'English Language', code: 'ENG103', maxMarks: 100 },
    { id: 'sub-13', classId: 'cls-3', name: 'General Science', code: 'SCI103', maxMarks: 100 },
    { id: 'sub-14', classId: 'cls-3', name: 'Social Studies', code: 'SOC103', maxMarks: 100 },
    // Grade 4
    { id: 'sub-15', classId: 'cls-4', name: 'Mathematics', code: 'MATH104', maxMarks: 100 },
    { id: 'sub-16', classId: 'cls-4', name: 'English Language', code: 'ENG104', maxMarks: 100 },
    { id: 'sub-17', classId: 'cls-4', name: 'General Science', code: 'SCI104', maxMarks: 100 },
    { id: 'sub-18', classId: 'cls-4', name: 'Social Studies', code: 'SOC104', maxMarks: 100 },
    // Grade 5
    { id: 'sub-19', classId: 'cls-5', name: 'Mathematics', code: 'MATH105', maxMarks: 100 },
    { id: 'sub-20', classId: 'cls-5', name: 'English Language', code: 'ENG105', maxMarks: 100 },
    { id: 'sub-21', classId: 'cls-5', name: 'General Science', code: 'SCI105', maxMarks: 100 },
    { id: 'sub-22', classId: 'cls-5', name: 'Social Studies', code: 'SOC105', maxMarks: 100 }
  ];

  const teachers = [
    {
      id: 'tch-1',
      fullName: 'Ahmed Jama',
      email: 'teacher@alimaama.demo',
      phone: '+252 63 444 1122',
      assignedClassIds: ['cls-1', 'cls-2'],
      assignedSubjectIds: ['sub-1', 'sub-2', 'sub-3', 'sub-6', 'sub-7', 'sub-8'],
      accountStatus: 'Active',
      specialization: 'STEM & Languages',
      joinedDate: '2025-08-15'
    },
    {
      id: 'tch-2',
      fullName: 'Fadumo Ali',
      email: 'fadumo.ali@alimaama.demo',
      phone: '+252 63 444 3344',
      assignedClassIds: ['cls-3', 'cls-4'],
      assignedSubjectIds: ['sub-11', 'sub-12', 'sub-15', 'sub-16'],
      accountStatus: 'Active',
      specialization: 'Humanities',
      joinedDate: '2025-08-15'
    },
    {
      id: 'tch-3',
      fullName: 'Hassan Nur',
      email: 'hassan.nur@alimaama.demo',
      phone: '+252 63 444 5566',
      assignedClassIds: ['cls-5'],
      assignedSubjectIds: ['sub-19', 'sub-20', 'sub-21'],
      accountStatus: 'Active',
      specialization: 'Natural Sciences',
      joinedDate: '2025-09-01'
    },
    {
      id: 'tch-4',
      fullName: 'Ubah Mohamed',
      email: 'ubah.m@alimaama.demo',
      phone: '+252 63 444 7788',
      assignedClassIds: ['cls-1', 'cls-2'],
      assignedSubjectIds: ['sub-4', 'sub-5', 'sub-9', 'sub-10'],
      accountStatus: 'Active',
      specialization: 'Social & Religious Studies',
      joinedDate: '2025-09-10'
    }
  ];

  // Exactly 7 fields: id, fullName, gender, dateOfBirth, parentPhone, classId, registrationDate
  const students = [
    // Grade 1 (cls-1)
    { id: 'STD-1001', fullName: 'Ayan Hersi Warsame', gender: 'Female', dateOfBirth: '2019-04-12', parentPhone: '+252 63 411 2233', classId: 'cls-1', registrationDate: '2026-08-20' },
    { id: 'STD-1002', fullName: 'Bilal Khalid Yusuf', gender: 'Male', dateOfBirth: '2019-06-18', parentPhone: '+252 63 422 3344', classId: 'cls-1', registrationDate: '2026-08-21' },
    { id: 'STD-1003', fullName: 'Deqa Abdi Farah', gender: 'Female', dateOfBirth: '2019-02-05', parentPhone: '+252 63 433 4455', classId: 'cls-1', registrationDate: '2026-08-22' },
    { id: 'STD-1004', fullName: 'Guled Mohamed Duale', gender: 'Male', dateOfBirth: '2019-09-14', parentPhone: '+252 63 444 5566', classId: 'cls-1', registrationDate: '2026-08-23' },
    { id: 'STD-1005', fullName: 'Hodan Said Elmi', gender: 'Female', dateOfBirth: '2019-01-30', parentPhone: '+252 63 455 6677', classId: 'cls-1', registrationDate: '2026-08-24' },
    { id: 'STD-1006', fullName: 'Idris Omar Botan', gender: 'Male', dateOfBirth: '2019-07-22', parentPhone: '+252 63 466 7788', classId: 'cls-1', registrationDate: '2026-08-25' },

    // Grade 2 (cls-2)
    { id: 'STD-1007', fullName: 'Khadra Ismail Gedi', gender: 'Female', dateOfBirth: '2018-03-10', parentPhone: '+252 63 477 8899', classId: 'cls-2', registrationDate: '2026-08-20' },
    { id: 'STD-1008', fullName: 'Liban Barkhad Egal', gender: 'Male', dateOfBirth: '2018-05-19', parentPhone: '+252 63 488 9900', classId: 'cls-2', registrationDate: '2026-08-21' },
    { id: 'STD-1009', fullName: 'Muna Dahir Kaahin', gender: 'Female', dateOfBirth: '2018-08-11', parentPhone: '+252 63 499 0011', classId: 'cls-2', registrationDate: '2026-08-22' },
    { id: 'STD-1010', fullName: 'Nasir Muse Shire', gender: 'Male', dateOfBirth: '2018-11-28', parentPhone: '+252 63 410 1122', classId: 'cls-2', registrationDate: '2026-08-23' },
    { id: 'STD-1011', fullName: 'Roda Yasin Guelleh', gender: 'Female', dateOfBirth: '2018-02-14', parentPhone: '+252 63 420 2233', classId: 'cls-2', registrationDate: '2026-08-24' },

    // Grade 3 (cls-3)
    { id: 'STD-1012', fullName: 'Suleiman Hassan Roble', gender: 'Male', dateOfBirth: '2017-06-25', parentPhone: '+252 63 430 3344', classId: 'cls-3', registrationDate: '2026-08-20' },
    { id: 'STD-1013', fullName: 'Ubax Ali Samatar', gender: 'Female', dateOfBirth: '2017-09-08', parentPhone: '+252 63 440 4455', classId: 'cls-3', registrationDate: '2026-08-21' },
    { id: 'STD-1014', fullName: 'Warsame Jibril Adan', gender: 'Male', dateOfBirth: '2017-12-03', parentPhone: '+252 63 450 5566', classId: 'cls-3', registrationDate: '2026-08-22' },
    { id: 'STD-1015', fullName: 'Yasmin Fuad Qalinle', gender: 'Female', dateOfBirth: '2017-04-17', parentPhone: '+252 63 460 6677', classId: 'cls-3', registrationDate: '2026-08-23' },

    // Grade 4 (cls-4)
    { id: 'STD-1016', fullName: 'Zakaria Noor Mahamud', gender: 'Male', dateOfBirth: '2016-01-20', parentPhone: '+252 63 470 7788', classId: 'cls-4', registrationDate: '2026-08-20' },
    { id: 'STD-1017', fullName: 'Amira Tariq Gelle', gender: 'Female', dateOfBirth: '2016-07-15', parentPhone: '+252 63 480 8899', classId: 'cls-4', registrationDate: '2026-08-21' },
    { id: 'STD-1018', fullName: 'Daahir Farah Obsiye', gender: 'Male', dateOfBirth: '2016-10-09', parentPhone: '+252 63 490 9900', classId: 'cls-4', registrationDate: '2026-08-22' },
    { id: 'STD-1019', fullName: 'Halima Bashir Nuur', gender: 'Female', dateOfBirth: '2016-03-31', parentPhone: '+252 63 401 1122', classId: 'cls-4', registrationDate: '2026-08-23' },

    // Grade 5 (cls-5)
    { id: 'STD-1020', fullName: 'Mustafa Jama Awale', gender: 'Male', dateOfBirth: '2015-05-12', parentPhone: '+252 63 402 2233', classId: 'cls-5', registrationDate: '2026-08-20' },
    { id: 'STD-1021', fullName: 'Nafisa Osman Bullale', gender: 'Female', dateOfBirth: '2015-08-24', parentPhone: '+252 63 403 3344', classId: 'cls-5', registrationDate: '2026-08-21' },
    { id: 'STD-1022', fullName: 'Rageh Mohamud Kayd', gender: 'Male', dateOfBirth: '2015-11-19', parentPhone: '+252 63 404 4455', classId: 'cls-5', registrationDate: '2026-08-22' },
    { id: 'STD-1023', fullName: 'Samira Abdirahman Egal', gender: 'Female', dateOfBirth: '2015-02-28', parentPhone: '+252 63 405 5566', classId: 'cls-5', registrationDate: '2026-08-23' }
  ];

  // Users for Authentication and RBAC
  const users = [
    {
      id: 'usr-1',
      fullName: 'Chief Administrator',
      email: 'admin@alimaama.demo',
      password: 'Admin123!',
      role: 'ADMIN',
      status: 'Active',
      createdAt: '2025-08-01'
    },
    {
      id: 'usr-2',
      fullName: 'Ahmed Jama',
      email: 'teacher@alimaama.demo',
      password: 'Teacher123!',
      role: 'TEACHER',
      teacherId: 'tch-1',
      status: 'Active',
      createdAt: '2025-08-15'
    },
    {
      id: 'usr-3',
      fullName: 'Fadumo Ali',
      email: 'fadumo.ali@alimaama.demo',
      password: 'Teacher123!',
      role: 'TEACHER',
      teacherId: 'tch-2',
      status: 'Active',
      createdAt: '2025-08-15'
    }
  ];

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Attendance Records
  const attendance = [
    // Today for Grade 1
    { id: 'att-1', studentId: 'STD-1001', classId: 'cls-1', teacherId: 'tch-1', date: todayStr, status: 'Present', recordedAt: new Date().toISOString() },
    { id: 'att-2', studentId: 'STD-1002', classId: 'cls-1', teacherId: 'tch-1', date: todayStr, status: 'Present', recordedAt: new Date().toISOString() },
    { id: 'att-3', studentId: 'STD-1003', classId: 'cls-1', teacherId: 'tch-1', date: todayStr, status: 'Excused', excusedReason: 'Medical appointment certified by doctor', recordedAt: new Date().toISOString() },
    { id: 'att-4', studentId: 'STD-1004', classId: 'cls-1', teacherId: 'tch-1', date: todayStr, status: 'Present', recordedAt: new Date().toISOString() },
    { id: 'att-5', studentId: 'STD-1005', classId: 'cls-1', teacherId: 'tch-1', date: todayStr, status: 'Absent', recordedAt: new Date().toISOString() },
    { id: 'att-6', studentId: 'STD-1006', classId: 'cls-1', teacherId: 'tch-1', date: todayStr, status: 'Present', recordedAt: new Date().toISOString() },

    // Yesterday for Grade 1
    { id: 'att-7', studentId: 'STD-1001', classId: 'cls-1', teacherId: 'tch-1', date: yesterdayStr, status: 'Present', recordedAt: new Date().toISOString() },
    { id: 'att-8', studentId: 'STD-1002', classId: 'cls-1', teacherId: 'tch-1', date: yesterdayStr, status: 'Present', recordedAt: new Date().toISOString() },
    { id: 'att-9', studentId: 'STD-1003', classId: 'cls-1', teacherId: 'tch-1', date: yesterdayStr, status: 'Present', recordedAt: new Date().toISOString() },
    { id: 'att-10', studentId: 'STD-1004', classId: 'cls-1', teacherId: 'tch-1', date: yesterdayStr, status: 'Present', recordedAt: new Date().toISOString() },
    { id: 'att-11', studentId: 'STD-1005', classId: 'cls-1', teacherId: 'tch-1', date: yesterdayStr, status: 'Present', recordedAt: new Date().toISOString() },
    { id: 'att-12', studentId: 'STD-1006', classId: 'cls-1', teacherId: 'tch-1', date: yesterdayStr, status: 'Present', recordedAt: new Date().toISOString() },

    // Grade 2 Today
    { id: 'att-13', studentId: 'STD-1007', classId: 'cls-2', teacherId: 'tch-1', date: todayStr, status: 'Present', recordedAt: new Date().toISOString() },
    { id: 'att-14', studentId: 'STD-1008', classId: 'cls-2', teacherId: 'tch-1', date: todayStr, status: 'Present', recordedAt: new Date().toISOString() },
    { id: 'att-15', studentId: 'STD-1009', classId: 'cls-2', teacherId: 'tch-1', date: todayStr, status: 'Present', recordedAt: new Date().toISOString() },
    { id: 'att-16', studentId: 'STD-1010', classId: 'cls-2', teacherId: 'tch-1', date: todayStr, status: 'Absent', recordedAt: new Date().toISOString() },
    { id: 'att-17', studentId: 'STD-1011', classId: 'cls-2', teacherId: 'tch-1', date: todayStr, status: 'Present', recordedAt: new Date().toISOString() }
  ];

  // Examinations & Marks
  // Grade 1 has BOTH Midterm and Final registered (enabling promotion for Grade 1!)
  // Grade 2 has ONLY Midterm registered (will show "Final Examination has not been registered yet.")
  const examinations = [
    {
      id: 'exam-1',
      classId: 'cls-1',
      examType: 'Midterm',
      academicYear: '2026-2027',
      term: 'Term 1',
      recordedDate: '2026-10-15',
      marks: {
        'STD-1001': { 'sub-1': 92, 'sub-2': 88, 'sub-3': 95, 'sub-4': 90, 'sub-5': 96, activity: 10, total: 471 },
        'STD-1002': { 'sub-1': 85, 'sub-2': 82, 'sub-3': 88, 'sub-4': 84, 'sub-5': 90, activity: 8, total: 437 },
        'STD-1003': { 'sub-1': 78, 'sub-2': 80, 'sub-3': 75, 'sub-4': 82, 'sub-5': 85, activity: null, total: 400 },
        'STD-1004': { 'sub-1': 95, 'sub-2': 91, 'sub-3': 94, 'sub-4': 89, 'sub-5': 92, activity: 9, total: 470 },
        'STD-1005': { 'sub-1': 70, 'sub-2': 75, 'sub-3': 72, 'sub-4': 68, 'sub-5': 78, activity: null, total: 363 },
        'STD-1006': { 'sub-1': 88, 'sub-2': 86, 'sub-3': 89, 'sub-4': 87, 'sub-5': 91, activity: 10, total: 451 }
      }
    },
    {
      id: 'exam-2',
      classId: 'cls-1',
      examType: 'Final',
      academicYear: '2026-2027',
      term: 'Term 1',
      recordedDate: '2026-11-01',
      marks: {
        'STD-1001': { 'sub-1': 94, 'sub-2': 90, 'sub-3': 96, 'sub-4': 92, 'sub-5': 98, activity: 10, total: 480 },
        'STD-1002': { 'sub-1': 88, 'sub-2': 85, 'sub-3': 90, 'sub-4': 86, 'sub-5': 92, activity: 9, total: 450 },
        'STD-1003': { 'sub-1': 82, 'sub-2': 84, 'sub-3': 80, 'sub-4': 85, 'sub-5': 88, activity: null, total: 419 },
        'STD-1004': { 'sub-1': 96, 'sub-2': 93, 'sub-3': 95, 'sub-4': 91, 'sub-5': 94, activity: 10, total: 479 },
        'STD-1005': { 'sub-1': 74, 'sub-2': 78, 'sub-3': 75, 'sub-4': 72, 'sub-5': 80, activity: 7, total: 386 },
        'STD-1006': { 'sub-1': 90, 'sub-2': 88, 'sub-3': 91, 'sub-4': 89, 'sub-5': 93, activity: 9, total: 460 }
      }
    },
    {
      id: 'exam-3',
      classId: 'cls-2',
      examType: 'Midterm',
      academicYear: '2026-2027',
      term: 'Term 1',
      recordedDate: '2026-10-18',
      marks: {
        'STD-1007': { 'sub-6': 91, 'sub-7': 89, 'sub-8': 92, 'sub-9': 88, 'sub-10': 94, activity: 8, total: 462 },
        'STD-1008': { 'sub-6': 83, 'sub-7': 80, 'sub-8': 85, 'sub-9': 82, 'sub-10': 86, activity: null, total: 416 },
        'STD-1009': { 'sub-6': 95, 'sub-7': 92, 'sub-8': 94, 'sub-9': 90, 'sub-10': 96, activity: 10, total: 487 },
        'STD-1010': { 'sub-6': 76, 'sub-7': 74, 'sub-8': 78, 'sub-9': 72, 'sub-10': 80, activity: null, total: 380 },
        'STD-1011': { 'sub-6': 88, 'sub-7': 86, 'sub-8': 89, 'sub-9': 87, 'sub-10': 90, activity: 9, total: 459 }
      }
    }
  ];

  // Payments Ledger
  // Two fee categories: Class Fee ($45) and School Fee ($35)
  // Monthly tracking for recent months: 2026-10 and 2026-11
  const payments = [
    {
      id: 'pay-1',
      studentId: 'STD-1001',
      feeCategory: 'Class Fee',
      month: '2026-10',
      amountDue: 45,
      amountPaid: 45,
      paymentMethod: 'ZAAD',
      paymentDate: '2026-10-02',
      transactionRef: 'ZAAD-884129',
      recordedBy: 'Chief Administrator'
    },
    {
      id: 'pay-2',
      studentId: 'STD-1001',
      feeCategory: 'School Fee',
      month: '2026-10',
      amountDue: 35,
      amountPaid: 35,
      paymentMethod: 'ZAAD',
      paymentDate: '2026-10-02',
      transactionRef: 'ZAAD-884130',
      recordedBy: 'Chief Administrator'
    },
    {
      id: 'pay-3',
      studentId: 'STD-1002',
      feeCategory: 'Class Fee',
      month: '2026-10',
      amountDue: 45,
      amountPaid: 45,
      paymentMethod: 'eDahab',
      paymentDate: '2026-10-04',
      transactionRef: 'EDH-992014',
      recordedBy: 'Chief Administrator'
    },
    {
      id: 'pay-4',
      studentId: 'STD-1002',
      feeCategory: 'School Fee',
      month: '2026-10',
      amountDue: 35,
      amountPaid: 20, // Partial payment!
      paymentMethod: 'Cash',
      paymentDate: '2026-10-05',
      transactionRef: 'CSH-REC-014',
      recordedBy: 'Chief Administrator'
    },
    {
      id: 'pay-5',
      studentId: 'STD-1004',
      feeCategory: 'Class Fee',
      month: '2026-10',
      amountDue: 45,
      amountPaid: 45,
      paymentMethod: 'ZAAD',
      paymentDate: '2026-10-06',
      transactionRef: 'ZAAD-773190',
      recordedBy: 'Chief Administrator'
    },
    {
      id: 'pay-6',
      studentId: 'STD-1004',
      feeCategory: 'School Fee',
      month: '2026-10',
      amountDue: 35,
      amountPaid: 35,
      paymentMethod: 'ZAAD',
      paymentDate: '2026-10-06',
      transactionRef: 'ZAAD-773191',
      recordedBy: 'Chief Administrator'
    },
    {
      id: 'pay-7',
      studentId: 'STD-1007',
      feeCategory: 'Class Fee',
      month: '2026-10',
      amountDue: 45,
      amountPaid: 45,
      paymentMethod: 'eDahab',
      paymentDate: '2026-10-08',
      transactionRef: 'EDH-110293',
      recordedBy: 'Chief Administrator'
    },
    {
      id: 'pay-8',
      studentId: 'STD-1008',
      feeCategory: 'Class Fee',
      month: '2026-10',
      amountDue: 45,
      amountPaid: 25, // Partial payment
      paymentMethod: 'Cash',
      paymentDate: '2026-10-09',
      transactionRef: 'CSH-REC-019',
      recordedBy: 'Chief Administrator'
    }
  ];

  const promotions = [
    {
      id: 'prm-1',
      studentId: 'STD-1007',
      previousClassId: 'cls-1',
      newClassId: 'cls-2',
      academicYear: '2025-2026',
      promotedDate: '2026-08-15',
      promotedBy: 'Chief Administrator'
    }
  ];

  const incomes = [
    {
      id: 'inc-1',
      title: 'Registration & Admission Fees',
      category: 'Registration',
      description: 'New student registration fees for Term 1',
      amount: 320,
      paymentMethod: 'ZAAD',
      date: '2026-10-03',
      referenceNumber: 'INC-ZAAD-101',
      notes: 'Term 1 admissions desk'
    },
    {
      id: 'inc-2',
      title: 'Quran Mushaf & Textbooks',
      category: 'Books & Supplies',
      description: 'Printed curriculum textbooks and Quran distribution',
      amount: 185,
      paymentMethod: 'Cash',
      date: '2026-10-07',
      referenceNumber: 'INC-CSH-102',
      notes: 'Bursar receipt batch'
    },
    {
      id: 'inc-3',
      title: 'Community Endowment Donation',
      category: 'Donation',
      description: 'Monthly community madrasa & scholarship contribution',
      amount: 500,
      paymentMethod: 'eDahab',
      date: '2026-10-12',
      referenceNumber: 'INC-EDH-103',
      notes: 'Sponsor support'
    }
  ];

  const expenses = [
    {
      id: 'exp-1',
      title: 'Teacher Monthly Payroll',
      category: 'Salaries',
      description: 'Monthly teaching staff honorarium and salaries',
      amount: 650,
      paymentMethod: 'ZAAD',
      date: '2026-10-05',
      referenceNumber: 'EXP-PAY-201',
      notes: 'October teacher salary disbursement'
    },
    {
      id: 'exp-2',
      title: 'Electricity & Water Utilities',
      category: 'Utilities',
      description: 'Campus electricity, lighting, and clean water settlement',
      amount: 110,
      paymentMethod: 'eDahab',
      date: '2026-10-08',
      referenceNumber: 'EXP-UTL-202',
      notes: 'Utility office receipt'
    },
    {
      id: 'exp-3',
      title: 'Classroom Whiteboards & Supplies',
      category: 'Maintenance & Supplies',
      description: 'Whiteboard markers, stationery, and classroom upkeep',
      amount: 75,
      paymentMethod: 'Cash',
      date: '2026-10-11',
      referenceNumber: 'EXP-SUP-203',
      notes: 'Admin petty cash'
    }
  ];

  const settings = {
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
    resultCalcMethod: 'sum', // 'sum' | 'average' | 'weighted'
    weightedMidterm: 40,
    weightedFinal: 60
  };

  return {
    classes,
    subjects,
    teachers,
    students,
    users,
    attendance,
    examinations,
    payments,
    promotions,
    incomes,
    expenses,
    settings
  };
}

export const Storage = {
  get(key, defaultValue = null) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
      console.error(`Error reading ${key} from LocalStorage:`, e);
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`Error saving ${key} to LocalStorage:`, e);
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error(`Error removing ${key} from LocalStorage:`, e);
      return false;
    }
  },

  // Initialize and seed if empty, and migrate legacy defaults non-destructively
  init() {
    const initialized = localStorage.getItem('studently_initialized') || localStorage.getItem('alimaama_initialized');
    if (!initialized) {
      this.resetToSeed();
    } else {
      const seed = getInitialSeedData();

      // Safe upgrade for missing incomes/expenses collections without resetting existing records
      if (localStorage.getItem(STORAGE_KEYS.INCOMES) === null) {
        this.set(STORAGE_KEYS.INCOMES, seed.incomes);
      }
      if (localStorage.getItem(STORAGE_KEYS.EXPENSES) === null) {
        this.set(STORAGE_KEYS.EXPENSES, seed.expenses);
      }

      // Automatic non-destructive migration to MADARASATUL AL-IMAAM official logo & defaults
      const settings = this.get(STORAGE_KEYS.SETTINGS);
      if (settings) {
        let settingsChanged = false;
        if (!settings.institutionName || settings.institutionName.includes('STUDENTLY') || settings.institutionName === 'AL-IMAAMA International School') {
          settings.institutionName = 'MADARASATUL AL-IMAAM';
          settingsChanged = true;
        }
        if (!settings.institutionLogo) {
          settings.institutionLogo = '/assets/aistudio/image_6159b039.png';
          settingsChanged = true;
        }
        if (settings.contactPhone === '+252 63 440 9988') {
          settings.contactPhone = '063-4129440';
          settingsChanged = true;
        }
        if (settings.address === '12 Airport Road, Hargeisa') {
          settings.address = 'Hargeisa, Somaliland';
          settingsChanged = true;
        }
        if (settings.contactEmail === 'admin@studently.demo') {
          settings.contactEmail = 'admin@alimaama.demo';
          settingsChanged = true;
        }
        if (settingsChanged) {
          this.set(STORAGE_KEYS.SETTINGS, settings);
        }
      }

      const users = this.get(STORAGE_KEYS.USERS, []);
      let updatedUsers = false;
      users.forEach(u => {
        if (u.email === 'admin@studently.demo') {
          u.email = 'admin@alimaama.demo';
          updatedUsers = true;
        } else if (u.email === 'teacher@studently.demo') {
          u.email = 'teacher@alimaama.demo';
          updatedUsers = true;
        }
      });
      if (updatedUsers) {
        this.set(STORAGE_KEYS.USERS, users);
      }
      const teachers = this.get(STORAGE_KEYS.TEACHERS, []);
      let updatedTeachers = false;
      teachers.forEach(t => {
        if (t.email === 'teacher@studently.demo') {
          t.email = 'teacher@alimaama.demo';
          updatedTeachers = true;
        }
      });
      if (updatedTeachers) {
        this.set(STORAGE_KEYS.TEACHERS, teachers);
      }
    }
  },

  resetToSeed() {
    const seed = getInitialSeedData();
    this.set(STORAGE_KEYS.CLASSES, seed.classes);
    this.set(STORAGE_KEYS.SUBJECTS, seed.subjects);
    this.set(STORAGE_KEYS.TEACHERS, seed.teachers);
    this.set(STORAGE_KEYS.STUDENTS, seed.students);
    this.set(STORAGE_KEYS.USERS, seed.users);
    this.set(STORAGE_KEYS.ATTENDANCE, seed.attendance);
    this.set(STORAGE_KEYS.EXAMINATIONS, seed.examinations);
    this.set(STORAGE_KEYS.PAYMENTS, seed.payments);
    this.set(STORAGE_KEYS.PROMOTIONS, seed.promotions);
    this.set(STORAGE_KEYS.INCOMES, seed.incomes);
    this.set(STORAGE_KEYS.EXPENSES, seed.expenses);
    this.set(STORAGE_KEYS.SETTINGS, seed.settings);
    localStorage.setItem('studently_initialized', 'true');
  },

  // Generates next formatted Student ID, e.g. STD-1024
  generateNextStudentId() {
    const students = this.get(STORAGE_KEYS.STUDENTS, []);
    let maxNum = 1000;
    students.forEach(s => {
      const match = s.id.match(/STD-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    return `STD-${maxNum + 1}`;
  },

  // ID generator
  uuid(prefix = 'id') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
  },

  KEYS: STORAGE_KEYS
};

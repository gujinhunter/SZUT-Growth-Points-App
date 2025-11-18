const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const INPUT_FILE = path.resolve(__dirname, '../miniprogram/计算机名单.xlsx');
const OUTPUT_FILE = path.resolve(__dirname, '../student-whitelist.jsonl'); // 新文件名

const workbook = xlsx.readFile(INPUT_FILE);
const sheet = workbook.Sheets[workbook.SheetNames[0]];

const rows = xlsx.utils.sheet_to_json(sheet, {
  header: ['academy', 'grade', 'major', 'className', 'studentId', 'name', 'gender'],
  defval: ''
});

const data = rows
  .filter(item => item.studentId && item.name && item.studentId !== '学号')
  .map(item => ({
    academy: String(item.academy).trim(),
    grade: String(item.grade).trim(),
    major: String(item.major).trim(),
    className: String(item.className).trim(),
    studentId: String(item.studentId).trim(),
    name: String(item.name).trim(),
    gender: String(item.gender).trim(),
    createdAt: new Date(),
    updatedAt: new Date()
  }));

const ws = fs.createWriteStream(OUTPUT_FILE, { encoding: 'utf8' });
data.forEach((record, idx) => {
  ws.write(JSON.stringify(record));
  ws.write('\n');
});
ws.end(() => console.log(`已导出 ${data.length} 条记录到 ${OUTPUT_FILE}`));
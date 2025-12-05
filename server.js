const fs = require('fs');
const path = require('path');
const express = require('express');

const PORT = process.env.PORT || 3000;
const TARGET_MONTH = 12; // December only
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'reservations.json');
const allowedTimes = buildAllowedTimes();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

ensureDataFile();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/reservations', (req, res) => {
  const date = (req.query.date || '').trim();
  if (!isValidDate(date)) {
    return res
      .status(400)
      .json({ message: '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD, 12월 평일만 가능)' });
  }

  const data = loadData();
  const reservations = data[date] || {};
  return res.json({ date, reservations });
});

app.post('/api/reservations', (req, res) => {
  const { date, timeSlots, name, people } = req.body || {};

  if (!isValidDate(date)) {
    return res
      .status(400)
      .json({ message: '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD, 12월 평일만 가능)' });
  }
  if (!Array.isArray(timeSlots) || timeSlots.length === 0) {
    return res.status(400).json({ message: '하나 이상의 시간대를 선택해야 합니다.' });
  }
  const invalidSlot = timeSlots.find((slot) => !allowedTimes.includes(slot));
  if (invalidSlot) {
    return res.status(400).json({ message: `허용되지 않는 시간대입니다: ${invalidSlot}` });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ message: '성명을 입력해주세요.' });
  }
  const peopleNum = Number(people);
  if (!Number.isInteger(peopleNum) || peopleNum < 1 || peopleNum > 30) {
    return res.status(400).json({ message: '인원수는 1~30 사이 정수여야 합니다.' });
  }

  const data = loadData();
  const dateReservations = data[date] || {};
  const conflicts = timeSlots.filter((slot) => dateReservations[slot]);

  if (conflicts.length) {
    return res.status(409).json({
      message: '이미 예약된 시간이 있습니다.',
      conflicts
    });
  }

  timeSlots.forEach((slot) => {
    dateReservations[slot] = {
      name: name.trim(),
      people: peopleNum,
      createdAt: new Date().toISOString()
    };
  });

  data[date] = dateReservations;
  saveData(data);

  return res.status(201).json({ message: '예약이 완료되었습니다.', date, timeSlots });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2), 'utf-8');
  }
}

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw || '{}');
  } catch (_e) {
    return {};
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function isValidDate(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, yStr, mStr, dStr] = match;
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (m !== TARGET_MONTH) return false;

  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return false;
  if (dt.getMonth() + 1 !== m || dt.getDate() !== d) return false;

  const day = dt.getDay();
  if (day === 0 || day === 6) return false; // weekend
  return true;
}

function buildAllowedTimes() {
  const slots = [];
  for (let hour = 10; hour < 18; hour++) {
    for (const minute of [0, 30]) {
      const label = `${String(hour).padStart(2, '0')}:${minute === 0 ? '00' : '30'}`;
      slots.push(label);
    }
  }
  return slots;
}

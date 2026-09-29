const express = require("express");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");

const seed = [
  {
    id: 1,
    name: "해운대 기장국밥",
    category: "한식",
    location: "해운대구 중동, 학교에서 버스 2정거장",
    lat: 35.1665,
    lng: 129.159,
    priceRange: "6,000~9,000원",
    memo: "국밥 양 진짜 많고 무국도 맛있음. 체육대회 끝나고 단체로 감",
    author: "3학년 2반",
    createdAt: "2026-09-10T12:00:00.000Z",
    likes: 12,
    reviews: [
      { author: "기계과 3학년", rating: 5, text: "고기 부드럽고 국물 진짜 깔끔함", createdAt: "2026-09-10T12:30:00.000Z" },
      { author: "전자과 2학년", rating: 4, text: "점심시간 아슬아슬하게 다녀올 만함", createdAt: "2026-09-11T08:10:00.000Z" }
    ]
  },
  {
    id: 2,
    name: "좌동 돈까스집",
    category: "양식",
    location: "해운대구 좌동, 도보 10분",
    lat: 35.177,
    lng: 129.13,
    priceRange: "8,000~12,000원",
    memo: "등심돈까스 소스가 핵심. 리필되는 양배추 무한",
    author: "1학년 5반",
    createdAt: "2026-09-08T18:00:00.000Z",
    likes: 9,
    reviews: [
      { author: "화공과 1학년", rating: 5, text: "특등심 진짜 두툼함", createdAt: "2026-09-08T18:20:00.000Z" }
    ]
  },
  {
    id: 3,
    name: "밀면 브라더스",
    category: "분식",
    location: "해운대구 우동, 해운대시장 근처",
    lat: 35.1618,
    lng: 129.1605,
    priceRange: "5,000~7,000원",
    memo: "여름에 비빔밀면 최고. 만두도 꼭 시키기",
    author: "2학년 3반",
    createdAt: "2026-09-05T13:00:00.000Z",
    likes: 15,
    reviews: [
      { author: "기계과 2학년", rating: 5, text: "비빔밀면 + 만두 조합이 국룰", createdAt: "2026-09-05T13:15:00.000Z" },
      { author: "3학년 1반", rating: 4, text: "웨이팅 있어서 방과 후에 가는 게 좋음", createdAt: "2026-09-06T17:40:00.000Z" }
    ]
  }
];

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const data = JSON.parse(raw);
    if (Array.isArray(data.restaurants)) return data;
  } catch (e) {}
  return { restaurants: seed };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

let db = loadData();
let nextId = db.restaurants.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1;

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.use("/public", express.static(path.join(__dirname, "public")));

function avgRating(r) {
  if (!r.reviews.length) return 0;
  return r.reviews.reduce((s, v) => s + (v.rating || 0), 0) / r.reviews.length;
}

function validCoord(v, max) {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 && Math.abs(n) <= max ? n : null;
}

app.get("/api/restaurants", (req, res) => {
  const list = db.restaurants.map((r) => ({
    ...r,
    avgRating: Math.round(avgRating(r) * 10) / 10,
    reviewCount: r.reviews.length
  }));
  res.json(list);
});

app.post("/api/restaurants", (req, res) => {
  const { name, category, location, priceRange, memo, author, rating, reviewText, lat, lng } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "가게 이름을 입력하세요" });
  const restaurant = {
    id: nextId++,
    name: String(name).trim().slice(0, 50),
    category: String(category || "기타").trim(),
    location: String(location || "").trim().slice(0, 120),
    lat: validCoord(lat, 90),
    lng: validCoord(lng, 180),
    priceRange: String(priceRange || "").trim().slice(0, 50),
    memo: String(memo || "").trim().slice(0, 300),
    author: String(author || "익명의 부기공생").trim().slice(0, 30),
    createdAt: new Date().toISOString(),
    likes: 0,
    reviews: []
  };
  if (rating || reviewText) {
    restaurant.reviews.push({
      author: restaurant.author,
      rating: Math.min(5, Math.max(1, Number(rating) || 5)),
      text: String(reviewText || "").trim().slice(0, 300),
      createdAt: new Date().toISOString()
    });
  }
  db.restaurants.unshift(restaurant);
  saveData(db);
  res.status(201).json(restaurant);
});

app.post("/api/restaurants/:id/like", (req, res) => {
  const r = db.restaurants.find((x) => x.id === Number(req.params.id));
  if (!r) return res.status(404).json({ error: "없는 가게예요" });
  const liked = !!(req.body && req.body.liked);
  r.likes = Math.max(0, r.likes + (liked ? 1 : -1));
  saveData(db);
  res.json({ likes: r.likes, liked: liked });
});

app.delete("/api/restaurants/:id", (req, res) => {
  const idx = db.restaurants.findIndex((x) => x.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: "없는 가게예요" });
  const [removed] = db.restaurants.splice(idx, 1);
  saveData(db);
  res.json({ ok: true, id: removed.id });
});

app.post("/api/restaurants/:id/reviews", (req, res) => {
  const r = db.restaurants.find((x) => x.id === Number(req.params.id));
  if (!r) return res.status(404).json({ error: "없는 가게예요" });
  const { author, rating, text } = req.body || {};
  const review = {
    author: String(author || "익명의 부기공생").trim().slice(0, 30),
    rating: Math.min(5, Math.max(1, Number(rating) || 5)),
    text: String(text || "").trim().slice(0, 300),
    createdAt: new Date().toISOString()
  };
  if (!review.text) return res.status(400).json({ error: "리뷰 내용을 입력하세요" });
  r.reviews.push(review);
  saveData(db);
  res.status(201).json(review);
});

app.listen(PORT, () => {
  console.log(`부기공 맛집 지도 실행 중: http://localhost:${PORT}`);
});

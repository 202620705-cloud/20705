const API = location.protocol === "file:" ? "http://localhost:3000" : "";
let restaurants = [];
let category = "전체";
let sort = "likes";
let query = "";
let currentDetail = null;

let mainMap = null;
let markerLayer = null;
let pickMap = null;
let pickMarker = null;
let pickLatLng = null;
let dMap = null;

const CATEGORIES = ["전체", "한식", "중식", "일식", "양식", "분식", "카페", "야식", "기타"];

function $(id) { return document.getElementById(id); }

function nickname() {
  let n = localStorage.getItem("nickname");
  if (!n) {
    n = prompt("학교에서 쓰는 별명을 알려주세요 (예: 3학년 2반)") || "익명의 부기공생";
    localStorage.setItem("nickname", n.trim() || "익명의 부기공생");
  }
  return n;
}

function changeNickname() {
  const cur = localStorage.getItem("nickname") || "익명의 부기공생";
  const n = prompt("새 별명을 입력해주세요", cur);
  if (n && n.trim()) {
    localStorage.setItem("nickname", n.trim());
    $("user-badge").textContent = "⚙️ " + n.trim();
  }
}

function likedSet() {
  try { return new Set(JSON.parse(localStorage.getItem("likedIds") || "[]")); }
  catch (e) { return new Set(); }
}
function saveLikedSet(set) {
  localStorage.setItem("likedIds", JSON.stringify([...set]));
}

function starStr(score) {
  const full = Math.round(score);
  return "★".repeat(full) + "☆".repeat(5 - full);
}

function dateStr(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

async function api(path, opts) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "오류가 발생했어요");
  return data;
}

async function loadList() {
  restaurants = await api("/api/restaurants");
  render();
}

function visible() {
  let list = restaurants.slice();
  if (category !== "전체") list = list.filter((r) => r.category === category);
  if (query) list = list.filter((r) => (r.name + r.location + r.memo).includes(query));
  if (sort === "likes") list.sort((a, b) => b.likes - a.likes);
  if (sort === "rating") list.sort((a, b) => b.avgRating - a.avgRating || b.reviewCount - a.reviewCount);
  if (sort === "reviews") list.sort((a, b) => b.reviewCount - a.reviewCount || b.avgRating - a.avgRating);
  if (sort === "new") list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}

function render() {
  const list = visible();
  const liked = likedSet();
  $("empty").classList.toggle("hidden", list.length > 0);
  $("list").innerHTML = list.map((r) => `
    <div class="card" data-id="${r.id}">
      <div class="card-top">
        <div>
          <span class="badge">${r.category}</span>
          <h3>${esc(r.name)}</h3>
          <div class="stars">${r.avgRating ? starStr(r.avgRating) : "☆☆☆☆☆"}
            <span class="score">${r.avgRating || "-"} (${r.reviewCount})</span>
          </div>
        </div>
      </div>
      ${r.priceRange ? `<div class="card-meta">💰 ${esc(r.priceRange)}</div>` : ""}
      ${r.location ? `<div class="card-meta">📍 ${esc(r.location)}</div>` : ""}
      ${r.memo ? `<div class="card-memo">💬 ${esc(r.memo)}</div>` : ""}
      <div class="card-bottom">
        <span>by ${esc(r.author)} · ${dateStr(r.createdAt)}</span>
        <button class="like-btn ${liked.has(r.id) ? "liked" : ""}" data-like="${r.id}">${liked.has(r.id) ? "❤️" : "🤍"} ${r.likes}</button>
      </div>
    </div>
  `).join("");
  if (typeof L !== "undefined") refreshMapMarkers();
}

function pinIcon(color) {
  return L.divIcon({
    className: "",
    html: `<div class="pin-icon ${color ? "selected" : ""}"><span>🍴</span></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 34],
    popupAnchor: [0, -30]
  });
}

function initMainMap() {
  if (mainMap || typeof L === "undefined") return;
  mainMap = L.map("map", { scrollWheelZoom: true }).setView([35.1690, 129.1490], 13);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(mainMap);
  markerLayer = L.layerGroup().addTo(mainMap);
  refreshMapMarkers();
}

function refreshMapMarkers() {
  if (!mainMap || !markerLayer) return;
  markerLayer.clearLayers();
  visible().forEach((r) => {
    if (!r.lat || !r.lng) return;
    L.marker([r.lat, r.lng], { icon: pinIcon() })
      .addTo(markerLayer)
      .bindPopup(`
        <b>${esc(r.name)}</b><br>
        <span style="color:#ffb400">${starStr(r.avgRating)}</span>
        <span style="color:#6b8299;font-size:12px"> ${r.avgRating || "-"} (${r.reviewCount})</span><br>
        ${r.priceRange ? `<span style="color:#6b8299;font-size:12px">💰 ${esc(r.priceRange)}</span><br>` : ""}
        <button class="popup-link" onclick="openDetailById(${r.id})">자세히 보기</button>
      `);
  });
}

window.openDetailById = function (id) {
  const r = restaurants.find((x) => x.id === id);
  if (r) showDetail(r);
};

function switchView(view) {
  const isMap = view === "map";
  $("btn-list").classList.toggle("active", !isMap);
  $("btn-map").classList.toggle("active", isMap);
  $("list").classList.toggle("hidden", isMap);
  $("empty").classList.toggle("hidden", isMap || visible().length > 0);
  $("map-view").classList.toggle("hidden", !isMap);
  if (isMap) {
    initMainMap();
    if (mainMap) {
      requestAnimationFrame(() => {
        mainMap.invalidateSize();
        const pts = visible().filter((r) => r.lat && r.lng);
        if (pts.length > 1) {
          mainMap.fitBounds(pts.map((r) => [r.lat, r.lng]), { padding: [40, 40] });
        } else if (pts.length === 1) {
          mainMap.setView([pts[0].lat, pts[0].lng], 15);
        }
      });
    }
  }
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

function renderChips() {
  $("categories").innerHTML = CATEGORIES.map((c) =>
    `<button class="chip ${c === category ? "active" : ""}" data-cat="${c}">${c}</button>`
  ).join("");
}

let pickStars = 5;
function renderPickStars() {
  $("f-stars").innerHTML = [1, 2, 3, 4, 5]
    .map((i) => `<span class="${i <= pickStars ? "on" : ""}" data-star="${i}">★</span>`)
    .join("");
}

function openModal(id) { $(id).classList.remove("hidden"); }
function closeModal(id) {
  $(id).classList.add("hidden");
  if (id === "modal-detail" && dMap) { dMap.remove(); dMap = null; }
}

function showDetail(r) {
  currentDetail = r;
  $("detail-body").innerHTML = `
    <span class="badge">${r.category}</span>
    <h2 class="detail-name">${esc(r.name)}</h2>
    <div class="stars">${r.avgRating ? starStr(r.avgRating) : "☆☆☆☆☆"}
      <span class="score">${r.avgRating || "-"} (${r.reviewCount}명 참여)</span>
    </div>
    <div class="detail-meta" style="margin-top:8px">
      ${r.priceRange ? `💰 ${esc(r.priceRange)}<br>` : ""}
      ${r.location ? `📍 ${esc(r.location)}<br>` : ""}
      ✍️ 공유: ${esc(r.author)} · ${dateStr(r.createdAt)}
    </div>
    ${r.memo ? `<div class="detail-memo">💬 ${esc(r.memo)}</div>` : ""}
    <h3 style="font-size:15px;margin-bottom:4px">학생 후기 ${r.reviewCount}개</h3>
    ${r.reviews.slice().reverse().map((v) => `
      <div class="review">
        <div class="review-head">
          <b>${esc(v.author)}</b>
          <span class="review-date">${dateStr(v.createdAt)}</span>
        </div>
        <div class="stars" style="font-size:13px">${starStr(v.rating)}</div>
        <div class="review-text">${esc(v.text)}</div>
      </div>
    `).join("") || `<p style="color:var(--sub);font-size:14px;padding:12px 0">첫 후기를 남겨보세요!</p>`}
    <div class="review-form">
      <label>별점</label>
      <div id="d-stars" class="stars-input"></div>
      <label>후기</label>
      <textarea id="d-review" rows="2" maxlength="300" placeholder="솔직한 후기를 남겨주세요"></textarea>
      <div class="modal-actions">
        <button class="btn-danger" id="d-delete">삭제</button>
        <button class="btn-ghost" id="d-close">닫기</button>
        <button class="btn-primary" id="d-save">후기 등록</button>
      </div>
    </div>
    ${r.lat && r.lng ? `<div id="detail-map"></div>` : ""}
  `;
  dStars = 5;
  renderDetailStars();
  $("d-close").onclick = () => closeModal("modal-detail");
  $("d-save").onclick = saveReview;
  $("d-delete").onclick = deleteRestaurant;
  $("d-stars").onclick = (e) => {
    const s = e.target.getAttribute("data-star");
    if (s) { dStars = Number(s); renderDetailStars(); }
  };
  openModal("modal-detail");
  if (r.lat && r.lng && typeof L !== "undefined") {
    dMap = L.map("detail-map", { scrollWheelZoom: false, dragging: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(dMap);
    L.marker([r.lat, r.lng], { icon: pinIcon() }).addTo(dMap);
    dMap.setView([r.lat, r.lng], 15);
  }
}

let dStars = 5;
function renderDetailStars() {
  $("d-stars").innerHTML = [1, 2, 3, 4, 5]
    .map((i) => `<span class="${i <= dStars ? "on" : ""}" data-star="${i}">★</span>`)
    .join("");
}

async function saveReview() {
  const text = $("d-review").value.trim();
  if (!text) return alert("후기 내용을 입력해주세요");
  try {
    await api(`/api/restaurants/${currentDetail.id}/reviews`, {
      method: "POST",
      body: JSON.stringify({ author: nickname(), rating: dStars, text })
    });
    closeModal("modal-detail");
    await loadList();
    showDetail(restaurants.find((x) => x.id === currentDetail.id));
  } catch (e) { alert(e.message); }
}

async function deleteRestaurant() {
  if (!confirm(`"${currentDetail.name}" 가게를 삭제할까요?`)) return;
  try {
    await api(`/api/restaurants/${currentDetail.id}`, { method: "DELETE" });
    closeModal("modal-detail");
    await loadList();
  } catch (e) { alert(e.message); }
}

function init() {
  $("user-badge").textContent = "⚙️ " + nickname();
  $("user-badge").onclick = changeNickname;
  $("user-badge").title = "눌러서 별명 변경";
  loadList();
}

$("search").addEventListener("input", (e) => { query = e.target.value.trim(); render(); });
$("sort").addEventListener("change", (e) => { sort = e.target.value; render(); });
$("btn-list").onclick = () => switchView("list");
$("btn-map").onclick = () => switchView("map");
$("categories").addEventListener("click", (e) => {
  const c = e.target.getAttribute("data-cat");
  if (c) { category = c; renderChips(); render(); }
});

$("list").addEventListener("click", async (e) => {
  const likeId = e.target.getAttribute("data-like");
  if (likeId) {
    e.stopPropagation();
    const liked = likedSet();
    const nowLiked = !liked.has(Number(likeId));
    try {
      const res = await api(`/api/restaurants/${likeId}/like`, {
        method: "POST",
        body: JSON.stringify({ liked: nowLiked })
      });
      if (nowLiked) liked.add(Number(likeId)); else liked.delete(Number(likeId));
      saveLikedSet(liked);
      const r = restaurants.find((x) => x.id === Number(likeId));
      if (r) r.likes = res.likes;
      render();
    } catch (err) { alert(err.message); }
    return;
  }
  const card = e.target.closest(".card");
  if (card) showDetail(restaurants.find((x) => x.id === Number(card.dataset.id)));
});

function initPickMap() {
  if (pickMap || typeof L === "undefined") {
    if (pickMap) pickMap.invalidateSize();
    return;
  }
  pickMap = L.map("pick-map", { scrollWheelZoom: false }).setView([35.1690, 129.1490], 13);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(pickMap);
  pickMap.on("click", (e) => {
    pickLatLng = { lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) };
    if (pickMarker) pickMarker.setLatLng(e.latlng);
    else pickMarker = L.marker(e.latlng, { icon: pinIcon(true) }).addTo(pickMap);
    $("pick-pos").textContent = `위치 선택 완료: ${pickLatLng.lat}, ${pickLatLng.lng}`;
  });
}

$("fab").onclick = () => {
  pickStars = 5;
  renderPickStars();
  ["f-name", "f-location", "f-price", "f-memo", "f-review"].forEach((id) => ($(id).value = ""));
  pickLatLng = null;
  $("pick-pos").textContent = "지도를 클릭해 가게 위치를 표시해주세요";
  openModal("modal-add");
  initPickMap();
};
$("add-cancel").onclick = () => closeModal("modal-add");
$("f-stars").onclick = (e) => {
  const s = e.target.getAttribute("data-star");
  if (s) { pickStars = Number(s); renderPickStars(); }
};
$("add-save").onclick = async () => {
  const name = $("f-name").value.trim();
  if (!name) return alert("가게 이름을 입력해주세요");
  try {
    await api("/api/restaurants", {
      method: "POST",
      body: JSON.stringify({
        name,
        category: $("f-category").value,
        location: $("f-location").value,
        priceRange: $("f-price").value,
        memo: $("f-memo").value,
        author: nickname(),
        rating: pickStars,
        reviewText: $("f-review").value,
        lat: pickLatLng ? pickLatLng.lat : null,
        lng: pickLatLng ? pickLatLng.lng : null
      })
    });
    closeModal("modal-add");
    await loadList();
  } catch (e) { alert(e.message); }
};

document.querySelectorAll(".modal").forEach((m) =>
  m.addEventListener("click", (e) => { if (e.target === m) m.classList.add("hidden"); })
);

renderChips();
init();

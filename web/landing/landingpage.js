const diamonds = document.querySelectorAll('.diamond');
const count = diamonds.length;

// Sử dụng mảng phẳng (Flat arrays) để CPU truy cập nhanh hơn
const posX = new Float32Array(count);
const posY = new Float32Array(count);
const speeds = new Float32Array(count);
const mSens = new Float32Array(count);
const rotations = new Float32Array(count);

// Khởi tạo 1 lần duy nhất
diamonds.forEach((el, i) => {
  posX[i] = parseFloat(el.style.left) * window.innerWidth / 100;
  posY[i] = Math.random() * window.innerHeight;
  speeds[i] = 0.2 + Math.random() * 0.4;
  mSens[i] = 10 + Math.random() * 20;
  rotations[i] = Math.random() * 360;
});

let mX = 0, mY = 0;
let curMX = 0, curMY = 0;
let lastScrl = window.scrollY;

// Lắng nghe sự kiện với passive: true để không chặn scroll
window.addEventListener('mousemove', e => {
  mX = (e.clientX / window.innerWidth) - 0.5;
  mY = (e.clientY / window.innerHeight) - 0.5;
}, { passive: true });

function update() {
  const scrl = window.scrollY;
  const delta = scrl - lastScrl;
  lastScrl = scrl;

  // Làm mượt vị trí chuột (Lerp) - tính 1 lần cho tất cả hạt
  curMX += (mX - curMX) * 0.08;
  curMY += (mY - curMY) * 0.08;

  const h = window.innerHeight;

  for (let i = 0; i < count; i++) {
    // Cập nhật tọa độ Y dựa trên scroll
    posY[i] -= delta * speeds[i];

    // Xử lý tràn màn hình nhanh
    if (posY[i] < -50) posY[i] = h + 50;
    else if (posY[i] > h + 50) posY[i] = -50;

    // Tính toán vị trí cuối cùng
    const finalX = curMX * mSens[i];
    const finalY = posY[i] + (curMY * mSens[i]);

    // Render: Chỉ dùng translate3d và rotate
    // Không thay đổi bất kỳ thuộc tính nào khác như opacity hay màu sắc ở đây
    diamonds[i].style.transform = `translate3d(${finalX}px, ${finalY}px, 0) rotate(${rotations[i]}deg)`;
  }

  requestAnimationFrame(update);
}

// Bắt đầu vòng lặp animation
requestAnimationFrame(update);
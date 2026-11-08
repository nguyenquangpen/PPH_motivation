/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  // relative: true → glob tính theo thư mục chứa file này, không phụ thuộc thư mục đang chạy lệnh (E2E, Electron)
  content: { relative: true, files: ['./index.html', './src/**/*.{ts,tsx}'] },
  theme: { extend: {} },
  plugins: [],
};

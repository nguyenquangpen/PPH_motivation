import { fileURLToPath } from 'node:url';

// Chỉ định rõ file cấu hình Tailwind để không phụ thuộc thư mục đang chạy lệnh.
export default {
  plugins: {
    tailwindcss: { config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)) },
    autoprefixer: {},
  },
};

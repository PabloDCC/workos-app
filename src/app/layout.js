import './globals.css';

export const metadata = {
  title: 'WorkOS — Gestión Inmobiliaria',
  description: 'Gestión de tareas, agenda y proyectos para desarrollo inmobiliario',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

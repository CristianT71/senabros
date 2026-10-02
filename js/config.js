// Configuración pública de Supabase.
// La llave "anon" es pública por diseño (va en el navegador); lo que protege los datos son las
// políticas RLS de supabase/migrations. NUNCA pongas aquí la llave "service_role" ni la contraseña de la base de datos.
window.SENA_CONFIG = {
  supabaseUrl: 'https://ukstdfieqeldlvsgpuff.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrc3RkZmllcWVsZGx2c2dwdWZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NzQxNTAsImV4cCI6MjEwNjU1MDE1MH0.2k1PtczFnjzMov3YKrc3eUn9hdLaM-j4OM6LJ-78YIk',
  // Los jugadores entran con usuario + contraseña; por dentro se usa un correo sintético con este dominio.
  emailDomain: 'senabros.vercel.app',
};

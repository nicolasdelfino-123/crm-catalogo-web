# Faro CRM

CRM local para organizar clientes, altas, renovaciones, pagos, métricas y acciones de retención. Abre directamente en la lista de clientes; no tiene login porque está pensado para uso interno en un equipo controlado.

## Inicio rápido

En dos terminales, desde cualquier carpeta:

```bash
runback
runfront
```

`runback` crea el entorno Python, instala dependencias, inicializa SQLite y carga datos ficticios la primera vez. `runfront` instala las dependencias npm la primera vez. En la computadora abre `http://localhost:5173`. En un celular conectado a la misma red Wi-Fi, abre `http://IP-DE-LA-PC:5173`.

No hace falta activar `.venv`: `runback` usa directamente el Python del entorno virtual y mantiene Flask activo en esa terminal hasta presionar `Ctrl+C`.

La aplicación solicita iniciar sesión al abrir. Si la base local todavía no tiene un administrador, crealo desde la raíz del proyecto (la contraseña se solicita de forma oculta):

```bash
./createadmin
```

## Estructura

- `backend/app/__init__.py`: application factory y exportación de `db`.
- `backend/app/run.py`: punto de entrada para Gunicorn.
- `backend/models.py`: clientes, acciones, pagos, métricas, notas y plantillas.
- `backend/routes.py`: API REST y exportación CSV.
- `backend/seed.py`: datos de demostración y cronograma de retención.
- `frontend/src/App.jsx`: experiencia completa del CRM.
- `frontend/src/index.css`: sistema visual responsive.

## Verificación

```bash
cd backend && .venv/bin/pytest -q
cd frontend && npm run lint && npm run build
```

La base local se guarda en `backend/instance/crm.db`. Para reiniciar los datos, elimina ese archivo y ejecuta `./runback` nuevamente.

## Seguridad

Las credenciales de clientes se guardan con cifrado autenticado y se consultan mediante un endpoint separado, únicamente al abrir la pestaña correspondiente. No se incluyen en el detalle general ni en la exportación CSV. La clave se deriva de `JWT_SECRET_KEY`: conservá `backend/instance/.jwt-secret`, porque reemplazarla impide descifrar las credenciales existentes.

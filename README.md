# Mi Caja RUS — SaaS para comerciantes del Nuevo RUS

App web movil (PWA) para que pequenos comerciantes peruanos registren ventas en segundos
y controlen cuanto les falta para llegar al limite mensual del Nuevo RUS.

API-first: la misma API REST sirve a la web hoy y a una app Android en el futuro.

## Stack

- **Frontend:** React + TypeScript + Vite + TailwindCSS + PWA
- **Backend:** Node + Express + TypeScript + JWT
- **Base de datos:** SQLite (disenada para migrar a PostgreSQL)
- **Infra:** Docker + Docker Compose

## Arquitectura

```
Navegador / Android  ->  Nginx (frontend)  --/api-->  Backend Express  ->  SQLite (volumen)
```

## Seguridad incluida

- Hash de contrasenas con **bcrypt** (coste 12)
- **JWT** firmado con expiracion
- **Rate limiting** general + estricto en el login (anti fuerza bruta)
- **Helmet** (cabeceras seguras), CORS, payload limitado
- Validacion y sanitizacion con **Zod**
- Aislamiento multinegocio: cada usuario solo ve SUS datos
- Errores genericos al cliente (no filtra stack)
- Secretos en `.env` (fuera del repositorio)

## Despliegue paso a paso

### 1. Requisitos en el servidor
- Docker + Docker Compose (`docker --version`, `docker compose version`)

### 2. Clonar y configurar
```bash
git clone <URL_DEL_REPO> saas-rus
cd saas-rus
cp .env.example .env
nano .env        # rellenar JWT_SECRET, ADMIN_WHATSAPP, etc.
```

Generar un JWT_SECRET seguro:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Levantar
```bash
docker compose up -d --build
```
La web queda en `http://<IP_DEL_SERVIDOR>:8080` (o el `WEB_PORT` que pongas).

### 4. Crear el primer administrador
```bash
docker compose exec backend npm run create-admin -- 999111222 TuClaveSegura "Administracion"
```

### 5. (Opcional) Cargar datos demo
```bash
docker compose exec backend npm run seed
# Login demo -> celular: 987654321  clave: demo1234
```

## Comandos Docker utiles

```bash
docker compose ps                 # ver estado
docker compose logs -f backend    # ver logs del backend
docker compose stop               # desactivar (sin borrar)
docker compose start              # activar
docker compose down               # bajar todo (el volumen de datos persiste)
docker compose up -d --build      # reconstruir tras cambios de codigo
```

## API (resumen)

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| POST | `/api/auth/login` | no | Login celular+password -> JWT |
| POST | `/api/ventas` | si | Registrar venta |
| GET | `/api/ventas/resumen` | si | Resumen del dia + termometro |
| GET | `/api/ventas` | si | Historial del mes |
| DELETE | `/api/ventas/:id` | si | Anular venta |
| GET | `/api/suscripcion` | si | Estado de la suscripcion |
| GET | `/api/admin/clientes` | admin | Listar/buscar clientes |
| POST | `/api/admin/clientes/:id/extender` | admin | +30 / +60 dias |
| POST | `/api/admin/clientes/:id/estado` | admin | Activar / desactivar |

## Checklist para lanzar el MVP

- [ ] `.env` con `JWT_SECRET` largo y aleatorio
- [ ] `ADMIN_WHATSAPP` configurado (pantalla de vencimiento)
- [ ] Dominio + HTTPS (Let's Encrypt) antes de vender
- [ ] Primer admin creado y probado
- [ ] Registrar una venta y ver el termometro funcionando
- [ ] Probar nota por WhatsApp (link wa.me)
- [ ] Backup periodico del volumen `rus_data`
- [ ] Cambiar `WEB_PORT` / firewall segun el VPS

## Pendiente (siguientes fases)

- Modo offline (IndexedDB + cola + sync) — se hara despues
- Pantalla de historial con borrado confirmado en la UI
- Panel admin (UI) — la API ya existe
- Iconos PWA (`icon-192.png`, `icon-512.png`) y splash
- App Android (reusa esta misma API)

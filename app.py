import os
from dotenv import load_dotenv, find_dotenv
from flask import Flask, jsonify, request, send_from_directory, send_file
from flask_cors import CORS
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import joinedload
from sqlalchemy.sql import func
from database import db
from models import Client, Mission, Report, TeamMember, User, Library, Section, MissionStatus, Role, Form, Type, RequirementType
import logging
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash
from contextlib import contextmanager
from io import StringIO, BytesIO
import csv
from datetime import datetime
from models import (
    Client, Mission, Report, TeamMember, User, Library, Section,
    MissionStatus, Role, Form, Type, RequirementType, ReportStatus
)
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
from sqlalchemy.orm import joinedload
import json # <--- Assurez-vous que json est importé
from groq import Groq # <--- Assurez-vous que Groq est importé
import fitz # <--- LIGNE CORRIGÉE
import tempfile
from compare_pdfs import main as analyze_pdfs_main
# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URI', 'mysql+pymysql://root:root@localhost/auditit_db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['DEBUG'] = os.getenv('FLASK_DEBUG', 'False') == 'True'
app.config['UPLOAD_FOLDER'] = os.getenv('UPLOAD_FOLDER', os.path.join(os.path.abspath(os.path.dirname(__file__)), 'Uploads'))
app.config['ALLOWED_EXTENSIONS'] = {'pdf', 'doc', 'docx'}
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
CORS(app, resources={r"/api/*": {"origins": os.getenv('CORS_ORIGIN', 'http://localhost:3000')}})

# Ensure upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Logging setup
logging.basicConfig(filename='error.log', level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
app.logger.setLevel(logging.DEBUG)
handler = logging.FileHandler('error.log')
app.logger.addHandler(handler)

# Initialize database
db.init_app(app)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    app.logger.warning("La variable d'environnement 'GROQ_API_KEY' n'est pas définie. L'analyse par IA ne fonctionnera pas.")
    groq_client = None
else:
    try:
        groq_client = Groq(api_key=GROQ_API_KEY)
        app.logger.info("Client Groq initialisé avec la clé se terminant par '...{}'.".format(GROQ_API_KEY[-4:]))
    except Exception as e:
        groq_client = None
        app.logger.error(f"Échec de l'initialisation du client Groq : {e}")
PDF_CONTROL_EXTRACTOR_PROMPT = """
Tu es un assistant d'audit spécialisé dans la lecture de rapports SOC 2. Ta mission est de lire le texte brut extrait d'un rapport d'audit et d'extraire CHAQUE point de contrôle individuel listé. Pour chaque contrôle, tu dois extraire :
1. L'identifiant du contrôle (ex: "CC1.1.1", "CC1.1.2").
2. La description de l'activité de contrôle (Control Activity).
3. Le résultat du test (Test Results).
Si aucun contrôle n'est trouvé dans le texte fourni, retourne un objet JSON avec une liste "controls" vide.
**Texte à analyser :**
{text_chunk}
Retourne **UNIQUEMENT** un objet JSON valide contenant une seule clé "controls". La valeur doit être une liste d'objets.
"""

CONTROL_ANALYZER_PROMPT = """
Tu es un auditeur IT qui évalue le résultat d'un test de contrôle unique.
**Informations du contrôle :**
- Identifiant : {control_id}
- Activité de contrôle : {control_activity}
- Résultat du test par l'auditeur : {test_result}
**Ta mission :**
Attribue un score de conformité et une justification basés **uniquement sur le `test_result`**.
- Si le `test_result` est "No deviation identified", "Aucune déviation identifiée", ou une phrase similaire indiquant un succès total, le score doit être **100**. La justification doit confirmer que le contrôle est efficace.
- Si le `test_result` mentionne une "exception", un "échec" ou une déviation, attribue un score plus bas (entre 40 et 70) et explique la nature de l'échec dans la justification.
- Si le `test_result` n'est pas clair, attribue un score de 50.
Retourne **UNIQUEMENT** un objet JSON valide avec les clés "control_id", "score", et "justification".
"""

REPORT_SYNTHESIZER_PROMPT_FRONTEND = """
Tu es un directeur d'audit. Tu as reçu les scores de conformité pour tous les contrôles d'un rapport.
**Analyses des contrôles :**
{control_analyses}
**Ta mission :**
1.  **Calculer le score final de conformité** (moyenne de tous les scores, arrondi à l'entier).
2.  **Rédiger un résumé exécutif** (2-3 phrases) qui reflète le score. Si le score est élevé (ex: >95), indique que les contrôles sont globalement efficaces.
3.  **Identifier les points positifs** (les contrôles avec un score de 100). Liste les 3 plus pertinents. S'il n'y en a pas, retourne une liste vide.
4.  **Identifier les axes d'amélioration** (les contrôles avec un score < 100). Liste les 3 plus critiques. S'il n'y a pas de risque (tous les scores sont à 100), retourne une liste vide.

Retourne **UNIQUEMENT** un objet JSON valide avec les clés : "final_score" (nombre), "summary" (chaîne), "positive_points" (liste de chaînes), et "areas_for_improvement" (liste de chaînes).
"""

def call_groq_model(prompt, model_name):
    """Fonction générique pour appeler un modèle Groq et parser la réponse JSON."""
    if not groq_client:
        raise Exception("Le client Groq n'est pas initialisé.")
    try:
        chat_completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=model_name,
            response_format={"type": "json_object"},
        )
        response_content = chat_completion.choices[0].message.content
        return json.loads(response_content)
    except Exception as e:
        app.logger.error(f"Erreur lors de l'appel à l'API Groq : {type(e).__name__} - {e}")
        raise e

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']
def init_db():
    # ... (votre code existant, inchangé)
    with app.app_context():
        try:
            app.logger.info("Initializing database...")
            db.create_all()
            # Create admin user if not exists
            admin_user = db.session.query(User).filter_by(username='admin@pwc.com').first()
            if not admin_user:
                admin_user = User(
                    username='admin@pwc.com',
                    password=generate_password_hash('admin'),
                    fullname='Admin User',
                    email='admin@pwc.com',
                    role=Role.ADMIN_SUPERIOR
                )
                db.session.add(admin_user)
                db.session.commit()
                app.logger.info("Admin user created: admin@pwc.com with role ADMIN_SUPERIOR")
            else:
                app.logger.info("Admin user already exists: admin@pwc.com")
        except Exception as e:
            app.logger.error(f"Failed to initialize database: {str(e)}", exc_info=True)
            raise

init_db()


# Root endpoint
@app.route('/', methods=['GET'])
def home():
    app.logger.info("Root endpoint accessed")
    return jsonify({"message": "Flask server is running", "version": "1.0.0"}), 200

# Debug endpoint to list all routes
@app.route('/api/debug/routes', methods=['GET'])
def debug_routes():
    app.logger.info("Debug routes endpoint accessed")
    routes = []
    for rule in app.url_map.iter_rules():
        routes.append({
            "endpoint": rule.endpoint,
            "methods": list(rule.methods),
            "path": str(rule)
        })
    return jsonify({"routes": routes}), 200

# Transaction context manager
@contextmanager
def transaction():
    try:
        yield
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

# Utility functions
def allowed_file(filename):
    allowed_extensions = {'pdf', 'doc', 'docx'}
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions

# Validation functions
def validate_string(value, field_name, max_length):
    if not isinstance(value, str):
        raise ValueError(f"Invalid {field_name}: must be a string")
    if len(value) > max_length:
        raise ValueError(f"Invalid {field_name}: must be {max_length} characters or less")
    return value

def validate_enum(value, enum_class, field_name):
    if not value:
        return None
    if not isinstance(value, str):
        raise ValueError(f"Invalid {field_name}: must be a string")
    try:
        return enum_class(value)
    except ValueError:
        raise ValueError(f"Invalid {field_name}: {value}. Must be one of {[e.value for e in enum_class]}")

def validate_report_type(value):
    if not isinstance(value, str):
        raise ValueError("Invalid type: must be a string")
    try:
        return Type(value)
    except ValueError:
        raise ValueError(f"Invalid type: {value}. Must be one of {[e.value for e in Type]}")

def validate_numeric(value, field_name, min_value=0, is_integer=False):
    try:
        val = int(value) if is_integer else float(value)
        if val < min_value:
            raise ValueError(f"Invalid {field_name}: must be >= {min_value}")
        return val
    except (TypeError, ValueError):
        raise ValueError(f"Invalid {field_name}: must be a number")

def validate_date(value, field_name):
    if not value:
        return None
    try:
        return datetime.strptime(value, '%Y-%m-%d').date()
    except (TypeError, ValueError):
        raise ValueError(f"Invalid {field_name}: must be in YYYY-MM-DD format")

def update_library_section_count(library_id):
    try:
        library = db.session.get(Library, library_id)
        if library:
            library.number_of_section = len(library.sections)
            db.session.commit()
            app.logger.info(f"Updated section count for library {library_id}: {library.number_of_section}")
    except Exception as e:
        app.logger.error(f"Error updating section count for library {library_id}: {str(e)}")
        db.session.rollback()

def update_mission_report_count(mission_id):
    try:
        mission = db.session.get(Mission, mission_id)
        if mission:
            mission.number_of_report = len(mission.reports)
            db.session.commit()
            app.logger.info(f"Updated report count for mission {mission_id}: {mission.number_of_report}")
    except Exception as e:
        app.logger.error(f"Error updating report count for mission {mission_id}: {str(e)}")
        db.session.rollback()

def update_client_counts(client_id):
    try:
        client = db.session.get(Client, client_id)
        if client:
            client.number_of_active_project = len([m for m in client.missions if m.status == MissionStatus.ACTIVE])
            client.number_of_active_user = len(set(tm.user_id for m in client.missions for tm in m.team_members))
            db.session.commit()
            app.logger.info(f"Updated counts for client {client_id}: projects={client.number_of_active_project}, users={client.number_of_active_user}")
    except Exception as e:
        app.logger.error(f"Error updating counts for client {client_id}: {str(e)}")
        db.session.rollback()

@app.route('/api/uploads/<filename>', methods=['GET'])
def download_file(filename):
    try:
        filename = secure_filename(filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if not os.path.exists(file_path):
            app.logger.error(f"File not found: {filename}")
            return jsonify({"error": f"File not found: {filename}"}), 404
        
        section = db.session.query(Section).filter_by(file_path=filename).first()
        report = db.session.query(Report).filter_by(file_path=filename).first()

        if not section and not report:
            app.logger.error(f"File {filename} is not associated with any section or report")
            return jsonify({"error": f"File {filename} is not associated with any resource"}), 403

        view_inline = request.args.get('view', 'false').lower() == 'true'
        as_attachment = not view_inline
        
        if filename.endswith('.pdf'):
            mime_type = 'application/pdf'
        elif filename.endswith('.doc'):
            mime_type = 'application/msword'
        elif filename.endswith('.docx'):
            mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        else:
            mime_type = 'application/octet-stream'

        app.logger.info(f"{'Viewing' if view_inline else 'Downloading'} file: {filename}")
        
        return send_from_directory(
            app.config['UPLOAD_FOLDER'],
            filename,
            as_attachment=as_attachment,
            mimetype=mime_type
        )
    except Exception as e:
        app.logger.error(f"Error downloading file {filename}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    try:
        db.session.execute('SELECT 1')
        app.logger.info("Database connection successful")
        return jsonify({"status": "healthy", "database": "connected"}), 200
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error during health check: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/roles', methods=['GET'])
def get_roles():
    try:
        app.logger.info("Fetching roles")
        roles = [role.value for role in Role]
        return jsonify({"roles": roles}), 200
    except Exception as e:
        app.logger.error(f"Unexpected error fetching roles: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

# Client APIs
@app.route('/api/clients', methods=['POST'])
def create_client():
    data = request.get_json()
    if not data:
        app.logger.error("No data provided for client creation")
        return jsonify({"error": "No data provided"}), 400
    app.logger.debug(f"Received client creation request: {data}")
    try:
        with transaction():
            required_fields = ['company_name', 'status']
            for field in required_fields:
                if field not in data or not data[field]:
                    app.logger.error(f"Missing required field: {field}")
                    return jsonify({"error": f"Missing required field: {field}"}), 400
            company_name = validate_string(data['company_name'], "company_name", 255)
            status = validate_string(data['status'], "status", 50)
            secteur_d_activite = validate_string(data.get('secteur_d_activite', ''), "secteur_d_activite", 100) if data.get('secteur_d_activite') else None
            
            new_client = Client(
                company_name=company_name,
                secteur_d_activite=secteur_d_activite,
                status=status,
                number_of_active_user=0,
                number_of_active_project=0
            )
            db.session.add(new_client)
            db.session.flush()
            app.logger.info(f"Client created: ID {new_client.id}")
            
            total_price = new_client.total_mission_price or 0.0

            return jsonify({
                "id": new_client.id,
                "company_name": new_client.company_name,
                "secteur_d_activite": new_client.secteur_d_activite,
                "number_of_active_user": new_client.number_of_active_user,
                "number_of_active_project": new_client.number_of_active_project,
                "status": new_client.status,
                "total_mission_price": total_price
            }), 201
    except (KeyError, ValueError) as e:
        app.logger.error(f"Validation error creating client: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 400
    except IntegrityError:
        app.logger.error(f"Integrity error creating client: company_name {data.get('company_name')}", exc_info=True)
        return jsonify({"error": "Failed to create client: company_name may already exist"}), 400
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error creating client: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/clients', methods=['GET'])
def get_clients():
    try:
        app.logger.info("Fetching clients")
        search = request.args.get('search')
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))
        query = db.session.query(Client)
        if search:
            query = query.filter(Client.company_name.ilike(f"%{search}%"))
        clients = query.offset((page - 1) * per_page).limit(per_page).all()
        total = query.count()
        app.logger.info(f"Fetched {total} clients, page {page}, per_page {per_page}")
        return jsonify({
            "clients": [{
                "id": client.id,
                "company_name": client.company_name,
                "secteur_d_activite": client.secteur_d_activite,
                "number_of_active_user": client.number_of_active_user,
                "number_of_active_project": client.number_of_active_project,
                "status": client.status,
                "total_mission_price": client.total_mission_price or 0.0
            } for client in clients],
            "total": total,
            "page": page,
            "per_page": per_page
        }), 200
    except ValueError:
        app.logger.error("Invalid pagination parameters", exc_info=True)
        return jsonify({"error": "Invalid pagination parameters"}), 400
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error fetching clients: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/clients/<int:client_id>', methods=['GET'])
def get_client(client_id):
    try:
        app.logger.info(f"Fetching client: ID {client_id}")
        client = db.session.get(Client, client_id)
        if not client:
            app.logger.error(f"Client not found: {client_id}")
            return jsonify({"error": f"Client not found: {client_id}"}), 404
        return jsonify({
            "id": client.id,
            "company_name": client.company_name,
            "secteur_d_activite": client.secteur_d_activite,
            "number_of_active_user": client.number_of_active_user,
            "number_of_active_project": client.number_of_active_project,
            "status": client.status,
            "total_mission_price": client.total_mission_price or 0.0
        }), 200
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error fetching client {client_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/clients/<int:client_id>', methods=['PUT'])
def update_client(client_id):
    try:
        with transaction():
            app.logger.info(f"Updating client: ID {client_id}")
            client = db.session.get(Client, client_id)
            if not client:
                app.logger.error(f"Client not found: {client_id}")
                return jsonify({"error": f"Client not found: {client_id}"}), 404
            data = request.get_json()
            if not data:
                app.logger.error("No data provided for client update")
                return jsonify({"error": "No data provided"}), 400
            client.company_name = validate_string(data.get('company_name', client.company_name), "company_name", 255)
            client.secteur_d_activite = validate_string(data.get('secteur_d_activite', client.secteur_d_activite), "secteur_d_activite", 100) if data.get('secteur_d_activite') else client.secteur_d_activite
            client.status = validate_string(data.get('status', client.status), "status", 50)
            update_client_counts(client_id)
            app.logger.info(f"Client updated: ID {client_id}")
            return jsonify({
                "id": client.id,
                "company_name": client.company_name,
                "secteur_d_activite": client.secteur_d_activite,
                "number_of_active_user": client.number_of_active_user,
                "number_of_active_project": client.number_of_active_project,
                "status": client.status,
                "total_mission_price": client.total_mission_price or 0.0
            }), 200
    except (KeyError, ValueError) as e:
        app.logger.error(f"Validation error updating client {client_id}: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 400
    except IntegrityError:
        app.logger.error(f"Integrity error updating client {client_id}: company_name {data.get('company_name')}", exc_info=True)
        return jsonify({"error": "Failed to update client: company_name may already exist"}), 400
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error updating client {client_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/clients/<int:client_id>', methods=['DELETE'])
def delete_client(client_id):
    try:
        with transaction():
            app.logger.info(f"Deleting client: ID {client_id}")
            client = db.session.get(Client, client_id)
            if not client:
                app.logger.error(f"Client not found: {client_id}")
                return jsonify({"error": f"Client not found: {client_id}"}), 404
            db.session.delete(client)
            app.logger.info(f"Client deleted: ID {client_id}")
            return jsonify({"message": f"Client {client_id} deleted successfully"}), 200
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error deleting client {client_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/clients/export', methods=['GET'])
def export_clients():
    try:
        client_id = request.args.get('client_id', type=int)
        app.logger.info(f"Exporting clients as CSV{' for client_id ' + str(client_id) if client_id else ''}")
        if client_id:
            client = db.session.query(Client).filter_by(id=client_id).first()
            if not client:
                app.logger.error(f"Client {client_id} not found for export")
                return jsonify({"error": f"Client {client_id} not found"}), 404
            clients = [client]
        else:
            clients = db.session.query(Client).all()
            if not clients:
                app.logger.error("No clients found for export")
                return jsonify({"error": "No clients found"}), 404
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(['ID', 'Company Name', 'Total Mission Price', 'Activity Sector', 'Status'])
        for client in clients:
            writer.writerow([
                client.id,
                client.company_name,
                f"{(client.total_mission_price or 0.0):.2f}",
                client.secteur_d_activite or '-',
                client.status
            ])
        output.seek(0)
        app.logger.info("Clients CSV generated successfully")
        filename = f"client_{client_id}.csv" if client_id else "clients.csv"
        return send_file(
            StringIO(output.getvalue()),
            mimetype='text/csv',
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        app.logger.error(f"Unexpected error exporting clients: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

# --- MISSION APIs ---
@app.route('/api/missions', methods=['POST'])
def create_mission():
    data = request.get_json()
    if not data or not data.get('mission_name') or not data.get('client_id'):
        return jsonify({"error": "Missing required fields"}), 400
    try:
        with transaction():
            mission = Mission(**data)
            db.session.add(mission)
            db.session.flush()
            update_client_counts(mission.client_id)
            return jsonify({"id": mission.id, "mission_name": mission.mission_name}), 201
    except Exception as e:
        app.logger.error(f"Error creating mission: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500

# Dans votre fichier app.py

@app.route('/api/missions', methods=['GET'])
def get_missions():
    try:
        app.logger.info("Fetching missions")
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        search = request.args.get('search')
        client_id = request.args.get('client_id')

        # Utiliser joinedload pour charger les relations en une seule requête
        query = db.session.query(Mission).options(
            joinedload(Mission.reports).joinedload(Report.library),
            joinedload(Mission.team_members) # MODIFICATION: Charger aussi les membres de l'équipe
        )

        if client_id:
            try:
                query = query.filter(Mission.client_id == int(client_id))
            except ValueError:
                return jsonify({"error": "Invalid client_id parameter"}), 400
        
        if search:
            query = query.filter(Mission.mission_name.ilike(f"%{search}%"))

        pagination = query.paginate(page=page, per_page=per_page, error_out=False)
        missions = pagination.items
        total = pagination.total

        missions_data = []
        for mission in missions:
            latest_report = None
            if mission.reports:
                # Trier les rapports par ID (ou date) pour trouver le plus récent
                latest_report = sorted(mission.reports, key=lambda r: r.id, reverse=True)[0]

            # MODIFICATION: Construire un objet de réponse plus riche
            missions_data.append({
                "id": mission.id,
                "mission_name": mission.mission_name,
                "fiscal_year": mission.fiscal_year,
                "client_name": mission.client_name,
                "status": mission.status.value,
                "client_id": mission.client_id,
                "number_of_report": mission.number_of_report,
                "price": mission.price,
                "sujet_audit": latest_report.audit_subject if latest_report else 'N/A',
                "library_name": latest_report.library.name if latest_report and latest_report.library else 'N/A',
                # Ajout de détails supplémentaires
                "team_member_count": len(mission.team_members),
                "team_members": [
                    {"user_name": tm.user_name, "role": tm.role.value} for tm in mission.team_members
                ]
            })
        
        app.logger.info(f"Fetched {total} missions, page {page}, per_page {per_page}")
        return jsonify({
            "missions": missions_data,
            "total": total,
            "page": page,
            "per_page": per_page
        }), 200
    except ValueError as ve:
        app.logger.error(f"Invalid parameters: {str(ve)}", exc_info=True)
        return jsonify({"error": "Invalid parameters"}), 400
    except Exception as e:
        app.logger.error(f"Unexpected error fetching missions: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/missions/<int:mission_id>', methods=['GET'])
def get_mission(mission_id):
    try:
        app.logger.info(f"Fetching mission: ID {mission_id}")
        mission = db.session.get(Mission, mission_id)
        if not mission:
            app.logger.error(f"Mission not found: {mission_id}")
            return jsonify({"error": f"Mission not found: {mission_id}"}), 404
        return jsonify({
            "id": mission.id,
            "mission_name": mission.mission_name,
            "fiscal_year": mission.fiscal_year,
            "client_name": mission.client_name,
            "status": mission.status.value,
            "client_id": mission.client_id,
            "number_of_report": mission.number_of_report,
            "price": mission.price
        }), 200
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error fetching mission {mission_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/missions/<int:mission_id>', methods=['PUT'])
def update_mission(mission_id):
    try:
        with transaction():
            app.logger.info(f"Updating mission: ID {mission_id}")
            mission = db.session.get(Mission, mission_id)
            if not mission:
                app.logger.error(f"Mission not found: {mission_id}")
                return jsonify({"error": f"Mission not found: {mission_id}"}), 404
            data = request.get_json()
            if not data:
                app.logger.error("No data provided for mission update")
                return jsonify({"error": "No data provided"}), 400
            mission.mission_name = validate_string(data.get('mission_name', mission.mission_name), "mission_name", 255)
            mission.fiscal_year = validate_numeric(data.get('fiscal_year', mission.fiscal_year), "fiscal_year", is_integer=True)
            mission.client_name = validate_string(data.get('client_name', mission.client_name), "client_name", 255)
            mission.status = validate_enum(data.get('status', mission.status), MissionStatus, "status")
            mission.price = validate_numeric(data.get('price', mission.price), "price") if data.get('price') is not None else mission.price
            mission.number_of_report = validate_numeric(data.get('number_of_report', mission.number_of_report), "number_of_report", is_integer=True) if data.get('number_of_report') is not None else mission.number_of_report
            if 'client_id' in data:
                client = db.session.get(Client, data['client_id'])
                if not client:
                    app.logger.error(f"Invalid client_id: {data['client_id']}")
                    return jsonify({"error": f"Invalid client_id: {data['client_id']}"}), 404
                mission.client_id = data['client_id']
            update_client_counts(mission.client_id)
            app.logger.info(f"Mission updated: ID {mission_id}")
            return jsonify({
                "id": mission.id,
                "mission_name": mission.mission_name,
                "fiscal_year": mission.fiscal_year,
                "client_name": mission.client_name,
                "status": mission.status.value,
                "client_id": mission.client_id,
                "number_of_report": mission.number_of_report,
                "price": mission.price
            }), 200
    except (KeyError, ValueError) as e:
        app.logger.error(f"Validation error updating mission {mission_id}: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 400
    except IntegrityError:
        app.logger.error(f"Integrity error updating mission {mission_id}", exc_info=True)
        return jsonify({"error": "Failed to update mission: check constraints"}), 400
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error updating mission {mission_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/missions/<int:mission_id>', methods=['DELETE'])
def delete_mission(mission_id):
    try:
        with transaction():
            mission = db.session.get(Mission, mission_id)
            if not mission:
                return jsonify({"error": "Mission not found"}), 404
            client_id = mission.client_id
            db.session.delete(mission)
            update_client_counts(client_id)
            return jsonify({"message": "Mission deleted successfully"}), 200
    except Exception as e:
        app.logger.error(f"Error deleting mission {mission_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500

# Report APIs
# Report APIs
@app.route('/api/reports', methods=['GET'])
def get_reports():
    try:
        mission_id = request.args.get('mission_id', type=int)
        status = request.args.get('status')
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        
        # --- MODIFICATION COMMENCE ICI ---
        search = request.args.get('search') # Récupérer le terme de recherche
        # --- FIN DE LA MODIFICATION ---

        query = db.session.query(Report).options(joinedload(Report.mission)) # Eager load mission

        if mission_id:
            query = query.filter_by(mission_id=mission_id)
        if status:
            if status.lower() not in [e.value for e in ReportStatus]:
                app.logger.error(f"Invalid status: {status}")
                return jsonify({"error": f"Invalid status: {status}. Must be one of {[e.value for e in ReportStatus]}"}), 400
            query = query.filter_by(status=status.lower())
            
        # --- MODIFICATION COMMENCE ICI ---
        if search:
            # Ajouter le filtre de recherche sur le sujet de l'audit
            query = query.filter(Report.audit_subject.ilike(f"%{search}%"))
        # --- FIN DE LA MODIFICATION ---

        total = query.count()
        reports = query.offset((page - 1) * per_page).limit(per_page).all()
        
        reports_data = [
            {
                'id': report.id,
                # CORRECTION: Renommé 'type' en 'nature' pour correspondre au frontend
                'nature': report.type.value if report.type else 'N/A',
                'start_date': report.start_date.isoformat() if report.start_date else None,
                'end_date': report.end_date.isoformat() if report.end_date else None,
                'audit_subject': report.audit_subject,
                'mission_id': report.mission_id,
                'mission_name': report.mission.mission_name if report.mission else None,
                'library_id': report.library_id,
                'library': {
                    'id': report.library.id,
                    'name': report.library.name,
                    'number_of_section': report.library.number_of_section
                } if report.library else None, # Correction: vérifier report.library avant d'accéder à ses attributs
                'status': report.status.value,
                'download_url': f"/api/uploads/{os.path.basename(report.file_path)}" if report.file_path else None
            }
            for report in reports
        ]
        app.logger.info(f"Fetched {total} reports, page {page}, per_page {per_page}")
        return jsonify({
            'reports': reports_data,
            'total': total,
            'page': page,
            'per_page': per_page
        }), 200
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error fetching reports: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500
@app.route('/api/reports/<int:report_id>', methods=['GET'])
def get_report_by_id(report_id):
    try:
        app.logger.info(f"Fetching report by ID: {report_id}")
        report = db.session.query(Report).options(
            joinedload(Report.mission),
            joinedload(Report.library)
        ).get(report_id)

        if not report:
            app.logger.error(f"Report not found: {report_id}")
            return jsonify({"error": f"Report not found: {report_id}"}), 404

        report_data = {
            'id': report.id,
            'type': report.type.value if report.type else None,
            'start_date': report.start_date.isoformat() if report.start_date else None,
            'end_date': report.end_date.isoformat() if report.end_date else None,
            'audit_subject': report.audit_subject,
            'mission_id': report.mission_id,
            'library_id': report.library_id,
            'status': report.status.value,
        }
        return jsonify(report_data), 200
    except Exception as e:
        app.logger.error(f"Error fetching report {report_id}: {str(e)}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500
@app.route('/api/reports', methods=['POST'])
def create_report():
    try:
        with transaction():
            if not request.content_type.startswith('multipart/form-data'):
                return jsonify({"error": "Content-Type must be multipart/form-data"}), 415
            
            data = request.form
            if not data:
                app.logger.error("No input data provided for report creation")
                return jsonify({"error": "No input data provided"}), 400
            required_fields = ['audit_subject', 'mission_id']
            for field in required_fields:
                if field not in data or not data[field]:
                    app.logger.error(f"Missing required field: {field}")
                    return jsonify({"error": f"Missing required field: {field}"}), 400
            mission = db.session.get(Mission, data['mission_id'])
            if not mission:
                app.logger.error(f"Mission not found: {data['mission_id']}")
                return jsonify({"error": f"Mission not found: {data['mission_id']}"}), 404

            file_to_save = None
            if 'file' in request.files:
                file = request.files['file']
                if file and file.filename and allowed_file(file.filename):
                    filename = secure_filename(file.filename)
                    file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                    file_to_save = filename
                elif file and file.filename:
                    return jsonify({"error": "Invalid file type"}), 400

            status = validate_enum(data.get('status', 'encours'), ReportStatus, "status")
            report = Report(
                type=validate_report_type(data.get('type')) if data.get('type') else None,
                start_date=validate_date(data.get('start_date'), "start_date"),
                end_date=validate_date(data.get('end_date'), "end_date"),
                audit_subject=validate_string(data['audit_subject'], "audit_subject", 255),
                mission_id=data['mission_id'],
                library_id=data.get('library_id'),
                status=status,
                file_path=file_to_save
            )
            db.session.add(report)
            db.session.flush()
            update_mission_report_count(report.mission_id)
            update_client_counts(mission.client_id)
            app.logger.info(f"Report created: ID {report.id}")
            return jsonify({
                "message": "Report created successfully",
                "id": report.id,
                "status": report.status.value,
                "download_url": f"/api/uploads/{os.path.basename(report.file_path)}" if report.file_path else None
            }), 201
    except (KeyError, ValueError) as e:
        app.logger.error(f"Validation error creating report: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 400
    except IntegrityError:
        app.logger.error("Integrity error creating report", exc_info=True)
        return jsonify({"error": "Failed to create report: check constraints"}), 400
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error creating report: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/reports/<int:report_id>/export', methods=['GET'])
def export_report(report_id):
    try:
        report = db.session.query(Report).options(
            joinedload(Report.mission),
            joinedload(Report.library)
        ).get(report_id)

        if not report:
            return jsonify({'error': 'Report not found'}), 404

        if report.status != ReportStatus.TERMINER:
            return jsonify({'error': 'Report is not terminated, cannot export'}), 403
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        elements = []

        elements.append(Paragraph(f"Rapport d'Audit - ID: {report.id}", styles['Title']))
        elements.append(Spacer(1, 12))

        data = [
            ['Champ', 'Valeur'],
            ['Type', report.type.value if report.type else 'N/A'],
            ['Date de début', report.start_date.strftime('%d-%m-%Y') if report.start_date else 'N/A'],
            ['Date de fin', report.end_date.strftime('%d-%m-%Y') if report.end_date else 'N/A'],
            ['Sujet de l\'audit', report.audit_subject or 'N/A'],
            ['ID Mission', str(report.mission_id)],
            ['Nom de la Mission', report.mission.mission_name if report.mission else 'N/A'],
            ['ID Bibliothèque', str(report.library_id) if report.library_id else 'N/A'],
            ['Nom de la Bibliothèque', report.library.name if report.library else 'N/A'],
            ['Statut', report.status.value]
        ]
        
        table = Table(data)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        elements.append(table)

        doc.build(elements)
        buffer.seek(0)

        return send_file(
            buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f"rapport_{report_id}.pdf"
        )
    except Exception as e:
        app.logger.error(f"Error exporting report {report_id}: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to export report'}), 500

@app.route('/api/reports/export_terminated', methods=['GET'])
def export_terminated_reports():
    try:
        mission_id = request.args.get('mission_id', type=int)
        
        query = Report.query.filter_by(status=ReportStatus.TERMINER)
        if mission_id:
            query = query.filter_by(mission_id=mission_id)
        
        reports = query.all()
        
        if not reports:
            return jsonify({'error': 'No terminated reports found'}), 404
        
        output = StringIO()
        writer = csv.writer(output)
        
        headers = ['id', 'type', 'start_date', 'end_date', 'audit_subject', 'mission_id', 'library_id', 'status']
        writer.writerow(headers)
        
        for report in reports:
            writer.writerow([
                report.id,
                report.type or 'N/A',
                report.start_date.strftime('%Y-%m-%d') if report.start_date else 'N/A',
                report.end_date.strftime('%Y-%m-%d') if report.end_date else 'N/A',
                report.audit_subject,
                report.mission_id,
                report.library_id or 'N/A',
                report.status.value
            ])
        
        output.seek(0)
        filename = f"terminated_reports_{mission_id or 'all'}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        return send_file(
            StringIO(output.getvalue()),
            mimetype='text/csv',
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        app.logger.error(f"Error exporting terminated reports: {str(e)}")
        return jsonify({'error': 'Failed to export terminated reports'}), 500

# Library APIs
@app.route('/api/libraries', methods=['POST'])
def create_library():
    data = request.get_json()
    if not data:
        app.logger.error("No data provided for library creation")
        return jsonify({"error": "No data provided"}), 400
    app.logger.debug(f"Received library creation request: {data}")
    try:
        with transaction():
            required_fields = ['name', 'type']
            for field in required_fields:
                if field not in data or not data[field]:
                    app.logger.error(f"Missing required field: {field}")
                    return jsonify({"error": f"Missing required field: {field}"}), 400
            name = validate_string(data['name'], "name", 255)
            type_value = validate_enum(data['type'], Type, "type")
            number_of_section = validate_numeric(data.get('number_of_section', 0), "number_of_section", is_integer=True)
            new_library = Library(
                name=name,
                type=type_value,
                number_of_section=number_of_section
            )
            db.session.add(new_library)
            db.session.flush()
            app.logger.info(f"Library created: ID {new_library.id}")
            return jsonify({
                "id": new_library.id,
                "name": new_library.name,
                "type": new_library.type.value,
                "number_of_section": new_library.number_of_section
            }), 201
    except (KeyError, ValueError) as e:
        app.logger.error(f"Validation error creating library: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 400
    except IntegrityError:
        app.logger.error(f"Integrity error creating library", exc_info=True)
        return jsonify({"error": "Failed to create library: check constraints"}), 400
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error creating library: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/libraries', methods=['GET'])
def get_libraries():
    try:
        app.logger.info("Fetching libraries")
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))
        libraries = db.session.query(Library).offset((page - 1) * per_page).limit(per_page).all()
        total = db.session.query(Library).count()
        app.logger.info(f"Fetched {total} libraries, page {page}, per_page {per_page}")
        return jsonify({
            "libraries": [{
                "id": library.id,
                "name": library.name,
                "type": library.type.value,
                "number_of_section": library.number_of_section
            } for library in libraries],
            "total": total,
            "page": page,
            "per_page": per_page
        }), 200
    except ValueError:
        app.logger.error("Invalid pagination parameters", exc_info=True)
        return jsonify({"error": "Invalid pagination parameters"}), 400
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error fetching libraries: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/libraries/<int:library_id>', methods=['GET'])
def get_library(library_id):
    try:
        app.logger.info(f"Fetching library: ID {library_id}")
        library = db.session.get(Library, library_id)
        if not library:
            app.logger.error(f"Library not found: {library_id}")
            return jsonify({"error": f"Library not found: {library_id}"}), 404
        return jsonify({
            "id": library.id,
            "name": library.name,
            "type": library.type.value,
            "number_of_section": library.number_of_section
        }), 200
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error fetching library {library_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/libraries/<int:library_id>', methods=['PUT'])
def update_library(library_id):
    try:
        with transaction():
            app.logger.info(f"Updating library: ID {library_id}")
            library = db.session.get(Library, library_id)
            if not library:
                app.logger.error(f"Library not found: {library_id}")
                return jsonify({"error": f"Library not found: {library_id}"}), 404
            data = request.get_json()
            if not data:
                app.logger.error("No data provided for library update")
                return jsonify({"error": "No data provided"}), 400
            library.name = validate_string(data.get('name', library.name), "name", 255)
            library.type = validate_enum(data.get('type', library.type), Type, "type")
            library.number_of_section = validate_numeric(data.get('number_of_section', library.number_of_section), "number_of_section", is_integer=True)
            app.logger.info(f"Library updated: ID {library_id}")
            return jsonify({
                "id": library.id,
                "name": library.name,
                "type": library.type.value,
                "number_of_section": library.number_of_section
            }), 200
    except (KeyError, ValueError) as e:
        app.logger.error(f"Validation error updating library {library_id}: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 400
    except IntegrityError:
        app.logger.error(f"Integrity error updating library {library_id}", exc_info=True)
        return jsonify({"error": "Failed to update library: check constraints"}), 400
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error updating library {library_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/libraries/<int:library_id>', methods=['DELETE'])
def delete_library(library_id):
    try:
        with transaction():
            app.logger.info(f"Deleting library: ID {library_id}")
            library = db.session.get(Library, library_id)
            if not library:
                app.logger.error(f"Library not found: {library_id}")
                return jsonify({"error": f"Library not found: {library_id}"}), 404
            db.session.delete(library)
            app.logger.info(f"Library deleted: ID {library_id}")
            return jsonify({"message": f"Library {library_id} deleted successfully"}), 200
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error deleting library {library_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

# --- SECTION APIs ---
@app.route('/api/sections', methods=['POST'])
def create_section():
    try:
        with transaction():
            if not request.content_type.startswith('multipart/form-data'):
                return jsonify({"error": "Content-Type must be multipart/form-data"}), 415
            
            data = request.form
            required_fields = ['library_id', 'title', 'type']
            if not all(field in data for field in required_fields):
                return jsonify({"error": "Missing required fields"}), 400

            library_id = int(data['library_id'])
            if not db.session.get(Library, library_id):
                return jsonify({"error": "Library not found"}), 404

            file_to_save = None
            if 'file' in request.files:
                file = request.files['file']
                if file and file.filename and allowed_file(file.filename):
                    filename = secure_filename(file.filename)
                    file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                    file_to_save = filename
                elif file and file.filename:
                    return jsonify({"error": "Invalid file type"}), 400

            new_section = Section(
                library_id=library_id,
                title=validate_string(data['title'], "title", 255),
                type=validate_enum(data['type'], Form, "type"),
                file_path=file_to_save,
                requirement_type=validate_enum(data.get('requirement_type'), RequirementType, "requirement_type")
            )
            db.session.add(new_section)
            db.session.flush()
            update_library_section_count(library_id)
            
            return jsonify({
                "id": new_section.id, "library_id": new_section.library_id, "title": new_section.title,
                "type": new_section.type.value, "file_path": new_section.file_path,
                "download_url": f"/api/uploads/{new_section.file_path}" if new_section.file_path else None,
                "requirement_type": new_section.requirement_type.value if new_section.requirement_type else None
            }), 201
    except Exception as e:
        app.logger.error(f"Error creating section: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/sections', methods=['GET'])
def get_sections():
    try:
        library_id = request.args.get('library_id', type=int)
        if not library_id:
            return jsonify({"error": "library_id is required"}), 400
        
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        
        pagination = db.session.query(Section).filter_by(library_id=library_id).paginate(page=page, per_page=per_page, error_out=False)
        
        return jsonify({
            "sections": [{
                "id": sec.id, "library_id": sec.library_id, "title": sec.title, "type": sec.type.value,
                "file_path": sec.file_path,
                "download_url": f"/api/uploads/{sec.file_path}" if sec.file_path else None,
                "requirement_type": sec.requirement_type.value if sec.requirement_type else None
            } for sec in pagination.items],
            "total": pagination.total, "page": page, "per_page": per_page
        }), 200
    except Exception as e:
        app.logger.error(f"Error fetching sections: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/sections/<int:section_id>', methods=['PUT'])
def update_section(section_id):
    try:
        with transaction():
            section = db.session.get(Section, section_id)
            if not section:
                return jsonify({"error": "Section not found"}), 404
            
            data = request.form
            section.title = data.get('title', section.title)
            section.type = validate_enum(data.get('type', section.type.value), Form, "type")
            section.requirement_type = validate_enum(data.get('requirement_type', section.requirement_type.value if section.requirement_type else None), RequirementType, "requirement_type")

            if 'file' in request.files:
                file = request.files['file']
                if file and file.filename and allowed_file(file.filename):
                    filename = secure_filename(file.filename)
                    file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                    section.file_path = filename

            return jsonify({
                "id": section.id, "title": section.title, "type": section.type.value,
                "download_url": f"/api/uploads/{section.file_path}" if section.file_path else None,
                "requirement_type": section.requirement_type.value if section.requirement_type else None
            }), 200
    except Exception as e:
        app.logger.error(f"Error updating section {section_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/sections/<int:section_id>', methods=['DELETE'])
def delete_section(section_id):
    try:
        with transaction():
            section = db.session.get(Section, section_id)
            if not section:
                return jsonify({"error": "Section not found"}), 404
            
            library_id = section.library_id
            db.session.delete(section)
            update_library_section_count(library_id)
            
            return jsonify({"message": "Section deleted successfully"}), 200
    except Exception as e:
        app.logger.error(f"Error deleting section {section_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500

# Team Member APIs
@app.route('/api/team-members', methods=['POST'])
def create_team_member():
    data = request.get_json()
    if not data:
        app.logger.error("No data provided for team member creation")
        return jsonify({"error": "No data provided"}), 400
    app.logger.debug(f"Received team member creation request: {data}")
    try:
        with transaction():
            required_fields = ['user_id', 'mission_id', 'role']
            for field in required_fields:
                if field not in data or not data[field]:
                    app.logger.error(f"Missing required field: {field}")
                    return jsonify({"error": f"Missing required field: {field}"}), 400
            user_id = validate_numeric(data['user_id'], "user_id", is_integer=True)
            mission_id = validate_numeric(data['mission_id'], "mission_id", is_integer=True)
            role = validate_enum(data['role'], Role, "role")
            user = db.session.get(User, user_id)
            if not user:
                app.logger.error(f"Invalid user_id: {user_id} does not exist")
                return jsonify({"error": f"Invalid user_id: {user_id} does not exist"}), 404
            mission = db.session.get(Mission, mission_id)
            if not mission:
                app.logger.error(f"Invalid mission_id: {mission_id} does not exist")
                return jsonify({"error": f"Invalid mission_id: {mission_id} does not exist"}), 404
            new_team_member = TeamMember(
                user_name=user.fullname,
                role=role,
                mission_id=mission_id,
                user_id=user_id
            )
            db.session.add(new_team_member)
            db.session.flush()
            update_client_counts(mission.client_id)
            app.logger.info(f"Team member created: ID {new_team_member.id}")
            return jsonify({
                "id": new_team_member.id,
                "user_name": new_team_member.user_name,
                "role": new_team_member.role.value,
                "mission_id": new_team_member.mission_id,
                "user_id": new_team_member.user_id
            }), 201
    except (KeyError, ValueError) as e:
        app.logger.error(f"Validation error creating team member: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 400
    except IntegrityError:
        app.logger.error(f"Integrity error creating team member", exc_info=True)
        return jsonify({"error": "Failed to create team member: check constraints"}), 400
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error creating team member: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/team-members', methods=['GET'])
def get_team_members():
    try:
        app.logger.info("Fetching team members")
        mission_id = request.args.get('mission_id')
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))
        query = db.session.query(TeamMember)
        if mission_id:
            mission_id = int(mission_id)
            query = query.filter_by(mission_id=mission_id)
        team_members = query.offset((page - 1) * per_page).limit(per_page).all()
        total = query.count()
        app.logger.info(f"Fetched {total} team members, page {page}, per_page {per_page}")
        return jsonify({
            "team_members": [{
                "id": tm.id,
                "user_name": tm.user_name,
                "role": tm.role.value,
                "mission_id": tm.mission_id,
                "user_id": tm.user_id
            } for tm in team_members],
            "total": total,
            "page": page,
            "per_page": per_page
        }), 200
    except ValueError:
        app.logger.error("Invalid mission_id or pagination parameters", exc_info=True)
        return jsonify({"error": "Invalid mission_id or pagination parameters"}), 400
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error fetching team members: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/team-members/<int:team_member_id>', methods=['GET'])
def get_team_member(team_member_id):
    try:
        app.logger.info(f"Fetching team member: ID {team_member_id}")
        team_member = db.session.get(TeamMember, team_member_id)
        if not team_member:
            app.logger.error(f"Team member not found: {team_member_id}")
            return jsonify({"error": f"Team member not found: {team_member_id}"}), 404
        return jsonify({
            "id": team_member.id,
            "user_name": team_member.user_name,
            "role": team_member.role.value,
            "mission_id": team_member.mission_id,
            "user_id": team_member.user_id
        }), 200
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error fetching team member {team_member_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/team-members/<int:team_member_id>', methods=['PUT'])
def update_team_member(team_member_id):
    try:
        with transaction():
            app.logger.info(f"Updating team member: ID {team_member_id}")
            team_member = db.session.get(TeamMember, team_member_id)
            if not team_member:
                app.logger.error(f"Team member not found: {team_member_id}")
                return jsonify({"error": f"Team member not found: {team_member_id}"}), 404
            data = request.get_json()
            if not data:
                app.logger.error("No data provided for team member update")
                return jsonify({"error": "No data provided"}), 400
            if 'user_id' in data:
                user_id = validate_numeric(data['user_id'], "user_id", is_integer=True)
                user = db.session.get(User, user_id)
                if not user:
                    app.logger.error(f"Invalid user_id: {user_id} does not exist")
                    return jsonify({"error": f"Invalid user_id: {user_id} does not exist"}), 404
                team_member.user_id = user_id
                team_member.user_name = user.fullname
            if 'mission_id' in data:
                mission_id = validate_numeric(data['mission_id'], "mission_id", is_integer=True)
                mission = db.session.get(Mission, mission_id)
                if not mission:
                    app.logger.error(f"Invalid mission_id: {mission_id} does not exist")
                    return jsonify({"error": f"Invalid mission_id: {mission_id} does not exist"}), 404
                team_member.mission_id = mission_id
            if 'role' in data:
                team_member.role = validate_enum(data['role'], Role, "role")
            update_client_counts(team_member.mission.client_id)
            app.logger.info(f"Team member updated: ID {team_member_id}")
            return jsonify({
                "id": team_member.id,
                "user_name": team_member.user_name,
                "role": team_member.role.value,
                "mission_id": team_member.mission_id,
                "user_id": team_member.user_id
            }), 200
    except (KeyError, ValueError) as e:
        app.logger.error(f"Validation error updating team member {team_member_id}: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 400
    except IntegrityError:
        app.logger.error(f"Integrity error updating team member {team_member_id}", exc_info=True)
        return jsonify({"error": "Failed to update team member: check constraints"}), 400
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error updating team member {team_member_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/team-members/<int:team_member_id>', methods=['DELETE'])
def delete_team_member(team_member_id):
    try:
        with transaction():
            app.logger.info(f"Deleting team member: ID {team_member_id}")
            team_member = db.session.get(TeamMember, team_member_id)
            if not team_member:
                app.logger.error(f"Team member not found: {team_member_id}")
                return jsonify({"error": f"Team member not found: {team_member_id}"}), 404
            mission = db.session.get(Mission, team_member.mission_id)
            client_id = mission.client_id if mission else None
            db.session.delete(team_member)
            if client_id:
                update_client_counts(client_id)
            app.logger.info(f"Team member deleted: ID {team_member_id}")
            return jsonify({"message": f"Team member {team_member_id} deleted successfully"}), 200
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error deleting team member {team_member_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

# Dans votre fichier app.py

@app.route('/api/users', methods=['GET'])
def get_users():
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        
        # --- MODIFICATION: Ajouter la gestion de la recherche ---
        search = request.args.get('search')
        
        query = db.session.query(User)

        if search:
            # Recherche sur plusieurs champs : nom complet, nom d'utilisateur, email
            search_term = f"%{search}%"
            query = query.filter(
                db.or_(
                    User.fullname.ilike(search_term),
                    User.username.ilike(search_term),
                    User.email.ilike(search_term)
                )
            )
        # --- FIN DE LA MODIFICATION ---

        pagination = query.paginate(page=page, per_page=per_page, error_out=False)
        
        users_data = [
            {
                "id": user.id,
                "fullname": user.fullname,
                "username": user.username,
                "email": user.email,
                "phone_number": user.phone_number,
                "role": user.role.value
            } for user in pagination.items
        ]
        return jsonify({
            "users": users_data,
            "total": pagination.total, "page": page, "per_page": per_page
        }), 200
    except Exception as e:
        app.logger.error(f"Error fetching users: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500
    
@app.route('/api/users', methods=['POST'])
def create_user():
    data = request.get_json()
    if not data or not all(k in data for k in ['fullname', 'username', 'email', 'password', 'role']):
        return jsonify({"error": "Missing required fields"}), 400
    try:
        with transaction():
            new_user = User(
                fullname=data['fullname'],
                username=data['username'],
                email=data['email'],
                password=generate_password_hash(data['password']),
                role=validate_enum(data['role'], Role, 'role'),
                phone_number=data.get('phone_number')
            )
            db.session.add(new_user)
            db.session.flush()
            return jsonify({"id": new_user.id, "username": new_user.username}), 201
    except IntegrityError:
        return jsonify({"error": "Username or email already exists"}), 409
    except Exception as e:
        app.logger.error(f"Error creating user: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/users/<int:user_id>', methods=['GET'])
def get_user(user_id):
    try:
        app.logger.info(f"Fetching user: ID {user_id}")
        user = db.session.get(User, user_id)
        if not user:
            app.logger.error(f"User not found: {user_id}")
            return jsonify({"error": f"User not found: {user_id}"}), 404
        return jsonify({
            "id": user.id,
            "fullname": user.fullname,
            "username": user.username,
            "email": user.email,
            "phone_number": user.phone_number,
            "role": user.role.value
        }), 200
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error fetching user {user_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

# Dans votre fichier app.py

@app.route('/api/users/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    try:
        with transaction():
            app.logger.info(f"Updating user: ID {user_id}")
            user = db.session.get(User, user_id)
            if not user:
                app.logger.error(f"User not found: {user_id}")
                return jsonify({"error": f"User not found: {user_id}"}), 404
            
            data = request.get_json()
            if not data:
                app.logger.error("No data provided for user update")
                return jsonify({"error": "No data provided"}), 400

            # ==================== CORRECTION CLÉ ICI ====================
            # On ne met à jour que les champs qui sont présents dans la requête
            if 'fullname' in data:
                user.fullname = validate_string(data['fullname'], "fullname", 255)
            if 'username' in data:
                user.username = validate_string(data['username'], "username", 100)
            if 'email' in data:
                user.email = validate_string(data['email'], "email", 255)
            
            # Le mot de passe n'est mis à jour que s'il est fourni et non vide
            if 'password' in data and data['password']:
                user.password = generate_password_hash(data['password'])
            
            if 'phone_number' in data:
                user.phone_number = validate_string(data['phone_number'], "phone_number", 100) if data.get('phone_number') else None
            
            if 'role' in data:
                user.role = validate_enum(data['role'], Role, "role")
            # ==========================================================

            app.logger.info(f"User updated: ID {user_id}")
            return jsonify({
                "id": user.id,
                "fullname": user.fullname,
                "username": user.username,
                "email": user.email,
                "phone_number": user.phone_number,
                "role": user.role.value
            }), 200
    except (KeyError, ValueError) as e:
        app.logger.error(f"Validation error updating user {user_id}: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 400
    except IntegrityError:
        app.logger.error(f"Integrity error updating user {user_id}: username {data.get('username')} or email {data.get('email')}", exc_info=True)
        return jsonify({"error": "Failed to update user: username or email may already exist"}), 400
    except Exception as e:
        app.logger.error(f"Unexpected error updating user {user_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500
@app.route('/api/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    try:
        with transaction():
            app.logger.info(f"Deleting user: ID {user_id}")
            user = db.session.get(User, user_id)
            if not user:
                app.logger.error(f"User not found: {user_id}")
                return jsonify({"error": f"User not found: {user_id}"}), 404
            db.session.delete(user)
            app.logger.info(f"User deleted: ID {user_id}")
            return jsonify({"message": f"User {user_id} deleted successfully"}), 200
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error deleting user {user_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500
# Dans votre fichier app.py

@app.route('/api/analyze-report', methods=['POST'])
def analyze_report_conformity():
    app.logger.info("Requête d'analyse de conformité reçue.")

    if not groq_client:
        app.logger.error("Tentative d'analyse alors que le client Groq n'est pas initialisé.")
        return jsonify({"error": "Le service d'analyse par IA n'est pas configuré sur le serveur (clé API manquante)."}), 503

    if 'candidate_pdf' not in request.files or 'reference_pdf' not in request.files:
        app.logger.error("Fichiers manquants dans la requête: 'candidate_pdf' et 'reference_pdf' sont requis.")
        return jsonify({"error": "Les fichiers PDF de référence et candidat sont requis."}), 400

    candidate_file = request.files['candidate_pdf']
    reference_file = request.files['reference_pdf']

    if (candidate_file.filename == '' or not allowed_file(candidate_file.filename) or
        reference_file.filename == '' or not allowed_file(reference_file.filename)):
        app.logger.error("Type de fichier non valide pour le candidat ou la référence.")
        return jsonify({"error": "Type de fichier non valide. Seuls les fichiers PDF sont acceptés."}), 400

    # On a besoin des chemins des fichiers en dehors du 'with' pour le bloc 'finally'
    temp_dir_path = tempfile.mkdtemp(dir=app.config['UPLOAD_FOLDER'])
    candidate_filepath = os.path.join(temp_dir_path, secure_filename(candidate_file.filename))
    reference_filepath = os.path.join(temp_dir_path, secure_filename(reference_file.filename))

    try:
        candidate_file.save(candidate_filepath)
        reference_file.save(reference_filepath)
        app.logger.info(f"Fichiers sauvegardés temporairement: Candidat={candidate_filepath}, Référence={reference_filepath}")

        # Appel de la fonction d'analyse
        final_report = analyze_pdfs_main(
            reference_pdf_path=reference_filepath,
            candidate_pdf_path=candidate_filepath
        )

        # Vérification robuste du retour
        if not final_report:
             app.logger.error("L'analyse n'a retourné aucun résultat (None).")
             return jsonify({"error": "L'analyse a échoué et n'a retourné aucun résultat."}), 500

        if "error" in final_report:
            error_message = final_report.get("error", "L'analyse a produit une erreur non spécifiée.")
            app.logger.error(f"Erreur renvoyée par le script d'analyse : {error_message}")
            return jsonify({"error": error_message}), 422

        app.logger.info("Analyse par IA terminée avec succès.")
        return jsonify(final_report), 200

    except TypeError as te:
        app.logger.error(f"Erreur de type (TypeError) durant l'appel de l'analyse: {te}", exc_info=True)
        return jsonify({"error": f"Erreur de configuration du serveur (TypeError): {te}"}), 500
    except Exception as e:
        app.logger.error(f"Erreur majeure durant le processus d'analyse IA : {str(e)}", exc_info=True)
        # CORRECTION DU CODE DE STATUT HTTP
        return jsonify({"error": f"Une erreur est survenue sur le serveur durant l'analyse : {str(e)}"}), 500
    
    # CORRECTION DE LA SYNTAXE : Le bloc 'finally' est maintenant à la bonne place
    finally:
        # Logique de nettoyage pour supprimer les fichiers et le dossier temporaires
        try:
            for filepath in [candidate_filepath, reference_filepath]:
                if os.path.exists(filepath):
                    os.remove(filepath)
                    app.logger.info(f"Fichier temporaire {os.path.basename(filepath)} supprimé.")
            if os.path.exists(temp_dir_path):
                os.rmdir(temp_dir_path)
                app.logger.info(f"Dossier temporaire {os.path.basename(temp_dir_path)} supprimé.")
        except Exception as e:
            app.logger.error(f"Erreur lors du nettoyage des fichiers temporaires : {e}", exc_info=True)
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
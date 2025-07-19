
from sqlalchemy import Column, Integer, String, Float, ForeignKey, Enum as SQLEnum, Date
from sqlalchemy.orm import relationship
from database import db
from enum import Enum


class ReportStatus(Enum):
    ENCOURS = "encours"
    TERMINER = "terminer"

# Enum definitions
class Role(Enum):
    ADMIN_SUPERIOR = "admin_superior"
    MANAGER = "manager"
    LIBRARY_MANAGER = "library_manager"
    FILOWNER = "filowner"
    ENGAGEMENT_LEADER = "engagement_leader"
    TEAM_MANAGER = "team_manager"
    TEAM_MEMBER = "team_member"
    REVIEWER = "reviewer"
    READ_ONLY = "read_only"

class Form(Enum):
    NORMS = 'norme'
    SEMI_NORMS = 'semi_norme'
    FREE = 'libre'

class Type(Enum):
    TYPE_1 = '1'
    TYPE_2 = '2'

class RequirementType(Enum):
    OBLIGATOIRE = "obligatoire"
    FACULTATIVE = "facultative"

class MissionStatus(Enum):
    ACTIVE = "active"
    DESACTIVER = "desactiver"
    PENDING = "pending"

# Model definitions
class Client(db.Model):
    __tablename__ = 'clients'
    id = Column(Integer, primary_key=True)
    company_name = Column(String(255), nullable=False, unique=True)
    price = Column(Float, default=0.0, nullable=True)
    secteur_d_activite = Column(String(100), nullable=True)
    number_of_active_user = Column(Integer, default=0)
    number_of_active_project = Column(Integer, default=0)
    status = Column(String(50), nullable=False)
    missions = relationship('Mission', back_populates='client', lazy='select', cascade='all, delete-orphan')

    @property
    def total_mission_price(self):
        return sum(mission.price for mission in self.missions) if self.missions else 0.0

class Mission(db.Model):
    __tablename__ = 'missions'
    id = Column(Integer, primary_key=True)
    mission_name = Column(String(255), nullable=False)
    fiscal_year = Column(Integer, nullable=False)
    number_of_report = Column(Integer, default=0)
    client_name = Column(String(255), nullable=False)
    status = Column(SQLEnum(MissionStatus, native_enum=True, create_constraint=True), nullable=False)
    client_id = Column(Integer, ForeignKey('clients.id'), nullable=False)
    price = Column(Float, default=0.0)
    client = relationship('Client', back_populates='missions')
    reports = relationship('Report', back_populates='mission', lazy='select', cascade='all, delete-orphan')
    team_members = relationship('TeamMember', back_populates='mission', lazy='select', cascade='all, delete-orphan')

class Report(db.Model):
    __tablename__ = 'reports'
    id = Column(Integer, primary_key=True)
    type = Column(SQLEnum(Type, native_enum=True, create_constraint=True), nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    audit_subject = Column(String(100), nullable=False)
    mission_id = Column(Integer, ForeignKey('missions.id'), nullable=False)
    library_id = Column(Integer, ForeignKey('libraries.id'), nullable=True)
    status = Column(SQLEnum(ReportStatus, native_enum=True, create_constraint=True), default=ReportStatus.ENCOURS, nullable=False)
    file_path = Column(String(255), nullable=True)
    mission = relationship('Mission', back_populates='reports')
    library = relationship('Library', back_populates='reports')

class TeamMember(db.Model):
    __tablename__ = 'team_members'
    id = Column(Integer, primary_key=True)
    user_name = Column(String(255), nullable=False)
    role = Column(SQLEnum(Role, native_enum=True, create_constraint=True), nullable=False)
    mission_id = Column(Integer, ForeignKey('missions.id'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    mission = relationship('Mission', back_populates='team_members')
    user = relationship('User', back_populates='team_members')

class User(db.Model):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    fullname = Column(String(255), nullable=False)
    username = Column(String(100), unique=True, nullable=False)
    phone_number = Column(String(100), nullable=True)
    email = Column(String(255), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(SQLEnum(Role, native_enum=True, create_constraint=True), default=Role.READ_ONLY, nullable=False)
    team_members = relationship('TeamMember', back_populates='user', lazy='select', cascade='all, delete-orphan')

class Library(db.Model):
    __tablename__ = 'libraries'
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    type = Column(SQLEnum(Type, native_enum=True, create_constraint=True), nullable=False)
    number_of_section = Column(Integer, nullable=False, default=0)
    sections = relationship('Section', back_populates='library', lazy='select', cascade='all, delete-orphan')
    reports = relationship('Report', back_populates='library', lazy='select')

class Section(db.Model):
    __tablename__ = 'sections'
    id = Column(Integer, primary_key=True)
    library_id = Column(Integer, ForeignKey('libraries.id'), nullable=False)
    title = Column(String(255), nullable=False)
    type = Column(SQLEnum(Form, native_enum=True, create_constraint=True), nullable=False)
    content = Column(String(1000), nullable=True)
    file_path = Column(String(255), nullable=True)
    requirement_type = Column(SQLEnum(RequirementType, native_enum=True, create_constraint=True), nullable=True)
    library = relationship('Library', back_populates='sections')

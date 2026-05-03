import traceback
from sqlalchemy import (
    create_engine,
    ForeignKey,
    Column,
    Integer,
    Boolean,
    String,
    Text,
    DateTime,
    CHAR,
    func,
    event,
)
from sqlalchemy.orm import sessionmaker, declarative_base
from config import *
from encryption import encrypt, decrypt

Base = declarative_base()
DATABASE_URL = f"mysql+mysqlconnector://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}/{MYSQL_DATABASE}"
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
session = Session()


class RegisteredWhatsapp(Base):
    __tablename__ = "registereds"

    id = Column(Integer, primary_key=True)
    wa_number = Column(String)
    sso_ids = Column(String)
    pay_sso_id = Column(Integer)
    created_at = Column(DateTime, default=func.utc_timestamp())
    updated_at = Column(
        DateTime, default=func.utc_timestamp(), onupdate=func.utc_timestamp()
    )

    def __init__(self, wa_number, sso_ids, pay_sso_id):
        self.wa_number = wa_number
        self.sso_ids = sso_ids
        self.pay_sso_id = pay_sso_id

    def __repr__(self):
        return f"{self.wa_number} {self.sso_ids} {self.pay_sso_id}"


@event.listens_for(RegisteredWhatsapp, "before_insert")
def receive_before_insert(mapper, connection, target):
    target.created_at = func.utc_timestamp()
    target.updated_at = func.utc_timestamp()


@event.listens_for(RegisteredWhatsapp, "before_update")
def receive_before_update(mapper, connection, target):
    target.updated_at = func.utc_timestamp()


def registeredAddAccount(wa_number, arr_sso_ids: list):
    account = session.query(RegisteredWhatsapp).filter(
        RegisteredWhatsapp.wa_number == wa_number
    )
    for data in account:
        return False
    str_sso_ids = ", ".join(map(str, arr_sso_ids))
    new_account = RegisteredWhatsapp(wa_number, str_sso_ids)
    session.add(new_account)
    session.commit()
    return new_account.id


def registeredGetSSOIDS(wa_number):
    account = session.query(RegisteredWhatsapp).filter(
        RegisteredWhatsapp.wa_number == wa_number
    )
    for data in account:
        str_sso_ids = data.sso_ids.split(",")
        sso_ids = [int(item.strip()) for item in str_sso_ids]
        return data
    print(f"Account {wa_number} not found.")


class SSOAccounts(Base):
    __tablename__ = "sso_accounts"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String)
    login_cookie = Column(String)
    pick_location = Column(Integer)
    available_quota = Column(Integer)
    enable_submit = Column(Integer)
    status_login = Column(Integer)
    reminded = Column(Integer)
    created_at = Column(DateTime, default=func.utc_timestamp())
    updated_at = Column(
        DateTime, default=func.utc_timestamp(), onupdate=func.utc_timestamp()
    )

    def __init__(
        self,
        email,
        password,
        login_cookie,
        available_quota,
        location,
        enable_submit,
        status_login,
        reminded,
    ):
        self.email = email
        self.password = password
        self.login_cookie = login_cookie
        self.pick_location = location
        self.available_quota = available_quota
        self.enable_submit = enable_submit
        self.status_login = status_login
        self.reminded = reminded

    def __repr__(self):
        return f"{self.email} {self.password} {self.login_cookie} {self.pick_location} {self.available_quota} {self.enable_submit}"


@event.listens_for(SSOAccounts, "before_insert")
def receive_before_insert(mapper, connection, target):
    target.created_at = func.utc_timestamp()
    target.updated_at = func.utc_timestamp()


@event.listens_for(SSOAccounts, "before_update")
def receive_before_update(mapper, connection, target):
    target.updated_at = func.utc_timestamp()


# Adding new account
def ssoAddAccount(
    email,
    password,
    login_cookie,
    pick_location,
    available_quota,
    enable_submit,
    status_login,
    reminded,
):
    new_account = SSOAccounts(
        email,
        password,
        login_cookie,
        pick_location,
        available_quota,
        enable_submit,
        status_login,
        reminded,
    )
    session.add(new_account)
    session.commit()
    return new_account.id


# Getting all accounts
def ssoGetAccounts():
    accounts = session.query(SSOAccounts).all()
    if accounts:
        for acc in accounts:
            acc.email = decrypt(acc.email)
            acc.password = decrypt(acc.password)
        return accounts
    print("Accounts not found.")


# Getting account by ID
def ssoGetAccount(account_id):
    account = session.query(SSOAccounts).filter(SSOAccounts.id == account_id).first()
    if account:
        account.email = decrypt(account.email)
        account.password = decrypt(account.password)
        return account
    print(f"Account {account_id} not found.")


# Editing email and password
def ssoEditAccountEmailPassword(account_id, email, password):
    edited_account = (
        session.query(SSOAccounts).filter(SSOAccounts.id == account_id).first()
    )
    if edited_account:
        edited_account.email = encrypt(email)
        edited_account.password = encrypt(password)
        session.commit()
    else:
        print(f"Account {account_id} not found.")


# Editing quota
def ssoEditAccountQuota(account_id, available_quota):
    edited_account = (
        session.query(SSOAccounts).filter(SSOAccounts.id == account_id).first()
    )
    if edited_account:
        edited_account.available_quota = available_quota
        session.commit()
    else:
        print(f"Account {account_id} not found.")


# Editing enable_submit
def ssoEditAccountEnableSubmit(account_id, enable_submit):
    edited_account = (
        session.query(SSOAccounts).filter(SSOAccounts.id == account_id).first()
    )
    if edited_account:
        edited_account.enable_submit = enable_submit
        session.commit()
    else:
        print(f"Account {account_id} not found.")


# Flexible edit function
def ssoEditAccountByID(acc_id, update_fields):
    try:
        account = session.query(SSOAccounts).filter(SSOAccounts.id == acc_id).first()
        if account:
            for field, value in update_fields.items():
                if hasattr(account, field):
                    if field == "email" or field == "password":
                        setattr(account, field, encrypt(value))
                    else:
                        setattr(account, field, value)
            session.commit()
            return True
        else:
            print(f"Account with email {acc_id} not found.")
            return False
    except Exception as error:
        print(f"Error updating account: {error}")
        return False


def getActiveSSOAccountLocationAndCookie(filtering=False):
    try:
        registereds = (
            session.query(RegisteredWhatsapp)
            .with_entities(RegisteredWhatsapp.sso_ids)
            .all()
        )
        sso_ids_array = []
        for registered in registereds:
            ids = registered.sso_ids.split(",") if registered.sso_ids else []
            sso_ids_array.extend(ids)
        unique_sso_ids = list(
            set(int(id.strip()) for id in sso_ids_array if id.strip().isdigit())
        )
        query = session.query(
            SSOAccounts.id,
            SSOAccounts.email,
            SSOAccounts.login_cookie,
            SSOAccounts.pick_location,
            SSOAccounts.available_quota,
        ).filter(SSOAccounts.id.in_(unique_sso_ids), SSOAccounts.status_login.in_([1]))
        if filtering:
            query = query.filter(
                SSOAccounts.enable_submit == 1, SSOAccounts.available_quota > 0
            )
        sso_accounts = query.all()
        sso_accounts = [
            (item[0], decrypt(item[1]), item[2], item[3], item[4])
            for item in sso_accounts
        ]
        return sso_accounts

    except Exception as e:
        print(f"Error fetching SSO accounts: {str(e)}")
        raise


class TakenCoupons(Base):
    __tablename__ = "taken_coupons"

    id = Column(Integer, primary_key=True, index=True)
    sso_id = Column(Integer)
    kupon_id = Column(Integer)
    tanggal_id = Column(Integer)
    taken_success = Column(Boolean)
    coupon_file = Column(String)
    validation_url = Column(String)
    pick_location = Column(Integer)
    found_option_at = Column(DateTime)
    send_at = Column(DateTime)
    has_sent_at = Column(DateTime)
    wa_sent_at = Column(DateTime)
    created_at = Column(DateTime, default=func.utc_timestamp())
    updated_at = Column(
        DateTime, default=func.utc_timestamp(), onupdate=func.utc_timestamp()
    )

    def __init__(
        self,
        sso_id,
        kupon_id,
        tanggal_id,
        taken_success,
        coupon_file,
        validation_url,
        pick_location,
        found_option_at,
        send_at,
        has_sent_at,
        wa_sent_at,
    ):
        self.sso_id = sso_id
        self.kupon_id = kupon_id
        self.tanggal_id = tanggal_id
        self.taken_success = taken_success
        self.coupon_file = coupon_file
        self.validation_url = validation_url
        self.pick_location = pick_location
        self.found_option_at = found_option_at
        self.send_at = send_at
        self.has_sent_at = has_sent_at
        self.wa_sent_at = wa_sent_at

    def __repr__(self):
        return f"{self.id} {self.sso_id} {self.kupon_id} {self.created_at}"


@event.listens_for(TakenCoupons, "before_insert")
def receive_before_insert(mapper, connection, target):
    target.created_at = func.utc_timestamp()
    target.updated_at = func.utc_timestamp()


@event.listens_for(TakenCoupons, "before_update")
def receive_before_update(mapper, connection, target):
    target.updated_at = func.utc_timestamp()


def couponsAddEntry(
    sso_id,
    kupon_id,
    tanggal_id,
    taken_success,
    coupon_file,
    validation_url,
    pick_location,
    found_option_at,
    send_at,
    has_sent_at,
    wa_sent_at,
):
    try:
        new_entry = TakenCoupons(
            sso_id=sso_id,
            kupon_id=kupon_id,
            tanggal_id=tanggal_id,
            taken_success=taken_success,
            coupon_file=coupon_file,
            validation_url=validation_url,
            pick_location=pick_location,
            found_option_at=found_option_at,
            send_at=send_at,
            has_sent_at=has_sent_at,
            wa_sent_at=wa_sent_at,
        )
        session.add(new_entry)
        session.commit()
        return new_entry.id
    except Exception as e:
        session.rollback()
        print(f"Error adding entry: {e}")
        return None


class ErrorLogs(Base):
    __tablename__ = "error_logs"

    id = Column(Integer, primary_key=True, index=True)
    wa_number = Column(String(255))
    command = Column(String(255))
    error_message = Column(Text, nullable=False)
    stack = Column(Text)
    created_at = Column(DateTime, default=func.utc_timestamp())


@event.listens_for(ErrorLogs, "before_insert")
def receive_before_insert(mapper, connection, target):
    target.created_at = func.utc_timestamp()


def errorLogAdd(command, error):
    """Persist an exception to error_logs so it shows up in admin !errors.

    `command` is a short label (e.g. "python:main", "python:login_cookie").
    `error` may be an Exception or a string.
    """
    try:
        if isinstance(error, BaseException):
            msg = f"{type(error).__name__}: {error}"
            stack = "".join(traceback.format_exception(type(error), error, error.__traceback__))
        else:
            msg = str(error)
            stack = None
        entry = ErrorLogs(
            wa_number=None,
            command=(command or "")[:255],
            error_message=msg[:65535],
            stack=stack,
        )
        session.add(entry)
        session.commit()
    except Exception as log_err:
        session.rollback()
        print(f"[errorLogAdd] failed to persist: {log_err}")

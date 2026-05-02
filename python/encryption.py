from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import padding
import base64
import os
from config import *

key = bytes.fromhex(ENCRYPTION_KEY)
iv = bytes.fromhex(ENCRYPTION_IV)


def encrypt(text):
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    padder = padding.PKCS7(algorithms.AES.block_size).padder()
    padded_data = padder.update(text.encode()) + padder.finalize()
    encrypted = encryptor.update(padded_data) + encryptor.finalize()
    encrypted_base64 = base64.b64encode(encrypted).decode()
    return encrypted_base64


def decrypt(encrypted_data):
    encrypted_data = base64.b64decode(encrypted_data)
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    decrypted_padded = decryptor.update(encrypted_data) + decryptor.finalize()
    unpadder = padding.PKCS7(algorithms.AES.block_size).unpadder()
    decrypted = unpadder.update(decrypted_padded) + unpadder.finalize()
    return decrypted.decode()

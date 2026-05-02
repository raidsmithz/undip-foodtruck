import threading, json
from methods import *
from database import ssoEditAccountByID, getActiveSSOAccountLocationAndCookie

check_login_threading_instances = []


def load_instances_from_json(file_path):
    with open(file_path, "r") as f:
        loaded_instances = json.load(f)
    return loaded_instances


def create_instances_from_data(data):
    instances = []
    for instance_data in data.values():
        instance = BotUndipFoodTruck(**instance_data)
        instances.append(instance)
    return instances


if __name__ == "__main__":
    print("**[SYS] Login cookie starting...\n")

    # json_data = load_instances_from_json("saved_accounts.json")
    data = getActiveSSOAccountLocationAndCookie()
    json_data = {}
    for idx, tup in enumerate(data):
        account_id, email, login_cookie, pick_location, available_quota = (
            tup  # Unpack the tuple
        )
        json_data[idx] = {
            "account_id": account_id,
            "name_object": email[: email.find("@")],
            "location": pick_location,
            "available_quota": available_quota,
            "form_app_session": login_cookie,
        }
    instances = create_instances_from_data(json_data)
    for i, instance in enumerate(instances, 1):
        thread = threading.Thread(target=instance.run_checking_data, args=())
        thread.start()
        check_login_threading_instances.append(thread)
    for thread in check_login_threading_instances:
        thread.join()
    for i, instance in enumerate(instances, 1):
        ssoEditAccountByID(instance.account_id, {"status_login": instance.status_login})

    print("\n**[SYS] Login finished!")

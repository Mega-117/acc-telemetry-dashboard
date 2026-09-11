import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
p = root / "database.rules.json"
doc = json.loads(p.read_text(encoding="utf-8"))
old = doc["rules"]["pitwallV3"]
ns = "pitwallRoomsV1"
r = f"root.child('{ns}')"
room = f"{r}.child('rooms').child($room)"


def alive(sponsor, connection):
    value = f"{room}.child('occupancy').child({sponsor}).child({connection})"
    return (
        f"({sponsor} != null && {connection} != null && {value}.child('connectedAt').isNumber() &&"
        f" (!{value}.child('disconnectedAt').exists() || {value}.child('disconnectedAt').val() +"
        " 30000 > now))"
    )


def friends(a, b):
    def granted(x, y):
        g = f"root.child('pitwallV3/grants').child({x}).child({y})"
        return (
            f"({g}.child('status').val() == 'granted' && ({g}.child('scope').val() == 'always' ||"
            f" {g}.child('expiresAtMs').val() > now))"
        )

    return f"({granted(a,b)} && {granted(b,a)})"


witness = f"{r}.child('admissions').child($room).child(auth.uid)"
sponsor = f"{witness}.child('sponsorUid').val()"
conn = f"{witness}.child('connectionId').val()"
witness_valid = (
    f"({witness}.exists() && {friends('auth.uid', sponsor)} &&"
    f" {room}.child('access').child({sponsor}).exists() && {alive(sponsor,conn)})"
)
own_conn = f"{r}.child('directory').child(auth.uid).child('connectionId').val()"
own_alive = alive("auth.uid", own_conn)
member = f"(auth != null && {room}.child('access').child(auth.uid).exists() && {own_alive})"
preview = f"(auth != null && ({member} || {witness_valid}))"
newroot = (  # root from rooms/$room/access/$uid
    "newData.parent().parent().parent().parent().parent()"
)
newroom = f"{newroot}.child('{ns}/rooms').child($room)"
create = f"(!{room}.child('meta').exists() && {newroom}.child('meta/hostUid').val() == auth.uid)"
admit = f"({create} || {own_alive} || {witness_valid})"
single = (
    f"(!{r}.child('directory').child(auth.uid).exists() ||"
    f" {r}.child('directory').child(auth.uid).child('roomId').val() == $room ||"
    f" !{r}.child('rooms').child({r}.child('directory').child(auth.uid)"
    ".child('roomId').val()).child('access').child(auth.uid).exists())"
)

# Preserve the immutable Standard order/field validation; social paths change,
# while friendship grants remain in their original namespace.
social = json.loads(json.dumps(old).replace("pitwallV3", ns))
for key in ["grants", "outgoing", "roomIndex", "vehicles"]:
    social.pop(key, None)
rooms = social["rooms"]["$room"]
rooms.pop(".write", None)
rooms[".read"] = member
rooms["meta"][".read"] = preview
rooms["meta"][
    ".write"
] = f"auth != null && !data.exists() && newData.child('hostUid').val() == auth.uid && {single}"
rooms["meta"][".validate"] = rooms["meta"][".validate"].replace(".length == 16", ".length == 0")
slotref = f"{newroot}.child('{ns}/directory').child($uid).child('slot').val()"
slot_owned = (
    f"{slotref} != null && {newroom}.child('slots').child({slotref}).child('uid').val() == $uid"
)
rooms["access"] = {
    ".read": preview,
    "$uid": {
        ".write": (
            f"auth != null && auth.uid == $uid && (!newData.exists() || ({admit} && {single}))"
        ),
        ".validate": f"newData.val() == 'member' && {slot_owned}",
    },
}
slot_uid = "data.child('uid').val()"
slot_dir = f"{r}.child('directory').child({slot_uid})"
slot_conn = f"{slot_dir}.child('connectionId').val()"
slot_expired = (
    f"(data.child('reservedAt').val() + 30000 <= now && ({slot_dir}.child('roomId').val() != $room"
    f" || !{alive(slot_uid,slot_conn)}))"
)
rooms["slots"] = {
    ".read": preview,
    "$slot": {
        ".write": (
            "auth != null && ((!newData.exists() && data.child('uid').val() == auth.uid) ||"
            f" ((!data.exists() || data.child('uid').val() == auth.uid || {slot_expired}) &&"
            f" newData.child('uid').val() == auth.uid && {admit} && {single}))"
        ),
        ".validate": (
            "$slot.matches(/^(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15)$/) &&"
            " newData.hasChildren(['uid','reservedAt']) && newData.child('uid').isString() &&"
            " newData.child('reservedAt').val() == now"
        ),
        "$other": {".validate": False},
        "uid": {},
        "reservedAt": {},
    },
}
newroot_occ = "newData.parent().parent().parent().parent().parent().parent()"
newcreate_occ = create.replace(newroot, newroot_occ)
admit_occ = admit.replace(create, newcreate_occ)
next_access = f"{newroot_occ}.child('{ns}/rooms').child($room).child('access').child($uid).exists()"
rooms["occupancy"] = {
    ".read": preview,
    "$uid": {
        ".write": "auth != null && auth.uid == $uid && !newData.exists()",
        "$connection": {
            ".write": (
                f"auth != null && auth.uid == $uid && (!newData.exists() || ({admit_occ} &&"
                f" {next_access}))"
            ),
            ".validate": (
                "newData.hasChildren(['nickname','connectedAt']) &&"
                " newData.child('nickname').isString() && newData.child('nickname').val().length <="
                " 60 && newData.child('connectedAt').val() == now &&"
                " (!newData.child('disconnectedAt').exists() ||"
                " newData.child('disconnectedAt').val() == now)"
            ),
        },
    },
}
social["directory"] = {
    "$uid": {
        ".read": f"auth != null && (auth.uid == $uid || {friends('auth.uid','$uid')})",
        ".write": "auth != null && auth.uid == $uid",
        ".validate": (
            "newData.hasChildren(['roomId','connectionId','slot']) &&"
            " newData.child('slot').isString() && newData.child('roomId').isString() &&"
            " newData.child('connectionId').isString() &&"
            f" newData.parent().parent().parent().child('{ns}/rooms')"
            ".child(newData.child('roomId').val()).child('access').child($uid).exists()"
        ),
    }
}
directory_room = (
    f"newData.parent().parent().parent().child('{ns}/rooms').child(newData.child('roomId').val())"
)
social["directory"]["$uid"][".validate"] += (
    f" && {directory_room}.child('slots').child(newData.child('slot').val()).child('uid').val() =="
    " $uid &&"
    f" {directory_room}.child('occupancy').child($uid)"
    ".child(newData.child('connectionId').val()).exists()"
)
nsponsor = "newData.child('sponsorUid').val()"
nconn = "newData.child('connectionId').val()"
social["admissions"] = {
    "$room": {
        "$uid": {
            ".read": "auth != null && auth.uid == $uid",
            ".write": (
                "auth != null && auth.uid == $uid && (!newData.exists() ||"
                f" ({friends('auth.uid',nsponsor)} &&"
                f" {room}.child('access').child({nsponsor}).exists() && {alive(nsponsor,nconn)}))"
            ),
            ".validate": (
                "newData.hasChildren(['sponsorUid','connectionId','roomId']) &&"
                " newData.child('roomId').val() == $room"
            ),
        }
    }
}
social["connections"]["$uid"][
    ".read"
] = f"auth != null && (auth.uid == $uid || {friends('auth.uid','$uid')})"

# MFD snapshots are now per account and runtime connection.
mfd = rooms["mfd"]
rooms["mfd"] = {".read": member, "$uid": {"$connection": mfd}}
mfd.pop(".read", None)
mfd[".write"] = (
    f"auth != null && auth.uid == $uid && {room}.child('access').child(auth.uid).exists() &&"
    " newData.child('uid').val() == $uid && newData.child('connectionId').val() == $connection &&"
    f" {r}.child('connections').child($uid).child($connection).child('roomId').val() == $room"
)

# Each target owns its claim, allowing independent targets in one room.
orders = rooms["orders"]["$order"]


def targeted(value):
    if isinstance(value, dict):
        return {key: targeted(val) for key, val in value.items()}
    if not isinstance(value, str):
        return value
    return value.replace(
        ".child('control/claim')",
        ".child('control').child(newData.child('targetUid').val()).child('claim')",
    )


orders = targeted(orders)
# V4 context belongs to the selected account/connection, not the room itself.
orders[".validate"] = orders[".validate"].replace(
    ".child('mfd')",
    ".child('mfd').child(newData.child('targetUid').val())"
    ".child(newData.child('targetConnectionId').val())",
)
# claimedAt is one level below the order and uses a combined absolute path.
orders["claimedAtMs"][".validate"] = orders["claimedAtMs"][".validate"].replace(
    ".child('control/claim/claimedAtMs')",
    ".child('control').child(newData.parent().child('targetUid').val()).child('claim/claimedAtMs')",
)
rooms["orders"]["$order"] = orders
rooms["orders"][".read"] = member
claim = rooms["control"]["claim"]
claim[".write"] = f"auth != null && auth.uid == $target && ({claim['.write']})"
claim[".write"] = claim[".write"].replace(
    "newData.parent().parent().parent().parent().parent()",
    "newData.parent().parent().parent().parent().parent().parent()",
)
rooms["control"] = {".read": member, "$target": {"claim": claim}}


# Room membership admits new work. An already claimed order keeps its narrow
# outcome authority even after the executor has left the room.
def connected(user, connection):
    return (
        f"({alive(user,connection)} &&"
        f" !{room}.child('occupancy').child({user}).child({connection})"
        ".child('disconnectedAt').exists())"
    )


sender_conn = "newData.child('senderConnectionId').val()"
target_uid = "newData.child('targetUid').val()"
target_conn = "newData.child('targetConnectionId').val()"
claimref = f"{room}.child('control').child({target_uid}).child('claim')"
targetref = f"{r}.child('connections').child({target_uid}).child({target_conn})"
terminal = (
    "(newData.child('status').val() == 'applied' || newData.child('status').val() == 'partial' ||"
    " newData.child('status').val() == 'failed' || newData.child('status').val() == 'rejected')"
)
create_order = (
    f"(!data.exists() && {member} && newData.child('status').val() == 'pending' &&"
    f" newData.child('senderId').val() == auth.uid && {connected('auth.uid',sender_conn)} &&"
    f" {connected(target_uid,target_conn)} && {targetref}.child('roomId').val() == $room &&"
    f" {targetref}.child('kind').val() == 'driver' && {targetref}.child('driving').val() == true &&"
    f" {targetref}.child('sourceValid').val() == true && (!{claimref}.exists() ||"
    f" {claimref}.child('leaseUntilMs').val() <= now))"
)
ack = (
    "(data.child('status').val() == 'pending' && newData.child('status').val() == 'applying' &&"
    f" {member} && newData.child('claimedBy').val() == auth.uid &&"
    f" {connected('auth.uid',target_conn)} && {claimref}.child('orderId').val() == $order &&"
    f" {claimref}.child('uid').val() == auth.uid && {claimref}.child('connectionId').val() =="
    f" {target_conn} && newData.child('leaseUntilMs').val() =="
    f" {claimref}.child('leaseUntilMs').val() && {claimref}.child('leaseUntilMs').val() > now)"
)
finish = (
    "(data.child('status').val() == 'applying' && data.child('claimedBy').val() == auth.uid &&"
    f" {terminal})"
)
reject = (
    "(data.child('status').val() == 'pending' && newData.child('status').val() == 'rejected' &&"
    " (data.child('targetUid').val() == auth.uid || data.child('senderId').val() == auth.uid) &&"
    f" ({claimref}.child('orderId').val() != $order || {claimref}.child('leaseUntilMs').val() <="
    " now))"
)
orders[".write"] = (
    f"auth != null && newData.exists() && ({create_order} || {ack} || {finish} || {reject})"
)
orders[".read"] = (
    f"auth != null && ({member} || data.child('senderId').val() == auth.uid ||"
    " data.child('claimedBy').val() == auth.uid)"
)
# No retired applicator payload can exist in this namespace.
# Keep inherited immutable V4 fields and recipient-context validation intact.
orders[".validate"] += (
    " && (!newData.child('plan/method').exists() || newData.child('plan/method').val() =="
    " 'standard' || newData.child('plan/method').val() == 'mfd-v4')"
)
for retired in ["accDrive", "mfdV2", "mfdV3"]:
    orders["plan"].pop(retired, None)
claim_order = f"{room}.child('orders').child(newData.child('orderId').val())"
old_claim_order = (
    "newData.parent().parent().parent().child('orders').child(data.child('orderId').val())"
)
claim[".read"] = "auth != null && auth.uid == $target"
claim_connection = connected("auth.uid", "newData.child('connectionId').val()")
claim_driver = (
    f"{r}.child('connections').child(auth.uid).child(newData.child('connectionId').val())"
)
claim_connection += (
    f" && {claim_driver}.child('roomId').val() == $room && {claim_driver}.child('driving').val() =="
    f" true && {claim_driver}.child('sourceValid').val() == true"
)
claim[".write"] = (
    f"auth != null && auth.uid == $target && (newData.exists() ? ({member} && {claim_connection} &&"
    " (!data.exists() || data.child('leaseUntilMs').val() <= now) && newData.child('uid').val() =="
    f" auth.uid && {claim_order}.child('status').val() == 'pending' &&"
    f" {claim_order}.child('targetUid').val() == auth.uid &&"
    f" {claim_order}.child('targetConnectionId').val() == newData.child('connectionId').val() &&"
    f" {claim_order}.child('expiresAtMs').val() > now) : (data.child('uid').val() == auth.uid &&"
    f" {old_claim_order}.child('claimedBy').val() == auth.uid &&"
    f" ({old_claim_order}.child('status').val() == 'applied' ||"
    f" {old_claim_order}.child('status').val() == 'partial' ||"
    f" {old_claim_order}.child('status').val() == 'failed' ||"
    f" {old_claim_order}.child('status').val() == 'rejected')))"
)
doc["rules"][ns] = social
expected = json.dumps(doc, indent=2, ensure_ascii=False) + "\n"
if "--check" in sys.argv:
    if p.read_text(encoding="utf-8") != expected:
        raise SystemExit("Social rules drift: regenerate with build_pitwall_social_rules.py")
    print("PITWALL_SOCIAL_RULES_CHECK PASS")
else:
    p.write_text(expected, encoding="utf-8")
    print("Social rules generated; legacy namespace unchanged")

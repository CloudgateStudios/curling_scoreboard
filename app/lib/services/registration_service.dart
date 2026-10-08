import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class PairingCodeNotFoundException implements Exception {
  const PairingCodeNotFoundException();
}

class RegistrationService {
  RegistrationService(this._prefs);

  final SharedPreferences _prefs;

  static const _clubIdKey = 'clubId';
  static const _sheetIdKey = 'sheetId';
  static const _clubNameKey = 'clubName';
  static const _sheetNameKey = 'sheetName';

  bool get isRegistered => _prefs.getString(_clubIdKey) != null;
  String? get clubId => _prefs.getString(_clubIdKey);
  String? get sheetId => _prefs.getString(_sheetIdKey);
  String? get clubName => _prefs.getString(_clubNameKey);
  String? get sheetName => _prefs.getString(_sheetNameKey);

  /// True when the backend has turned this scoreboard's writes away, which
  /// means the sheet is no longer paired with it: it was paired with another
  /// device, or removed. The saved registration is left alone, so this is the
  /// only sign that scores have stopped syncing.
  final ValueNotifier<bool> pairingLost = ValueNotifier(false);

  /// Pairs this scoreboard with the sheet holding [code].
  ///
  /// The lookup and claim run in the `pairSheet` Cloud Function, because the
  /// security rules do not let clients read pairing codes or club documents.
  Future<void> connectWithPairingCode(String code) async {
    await FirebaseAuth.instance.signInAnonymously();

    final Map<String, dynamic> result;
    try {
      final response = await FirebaseFunctions.instance
          .httpsCallable('pairSheet')
          .call<Map<String, dynamic>>({'pairingCode': code});
      result = response.data;
    } on FirebaseFunctionsException catch (e) {
      await FirebaseAuth.instance.signOut();
      if (e.code == 'not-found') throw const PairingCodeNotFoundException();
      rethrow;
    }

    await Future.wait([
      _prefs.setString(_clubIdKey, result['clubId'] as String),
      _prefs.setString(_sheetIdKey, result['sheetId'] as String),
      _prefs.setString(_clubNameKey, result['clubName'] as String? ?? ''),
      _prefs.setString(_sheetNameKey, result['sheetName'] as String? ?? ''),
    ]);
    pairingLost.value = false;
  }

  Future<void> disconnect() async {
    // Best-effort: clear scoreboardUid before signing out so the sheet can be
    // re-paired. If this fails we still sign out locally.
    try {
      final cId = clubId;
      final sId = sheetId;
      if (cId != null && sId != null) {
        await FirebaseFirestore.instance
            .collection('clubs')
            .doc(cId)
            .collection('sheets')
            .doc(sId)
            .update({'scoreboardUid': FieldValue.delete()});
      }
    } on Exception catch (e) {
      debugPrint(
        'RegistrationService.disconnect scoreboardUid clear error: $e',
      );
    }

    await FirebaseAuth.instance.signOut();
    await Future.wait([
      _prefs.remove(_clubIdKey),
      _prefs.remove(_sheetIdKey),
      _prefs.remove(_clubNameKey),
      _prefs.remove(_sheetNameKey),
    ]);
    pairingLost.value = false;
  }
}

import 'package:cloud_firestore/cloud_firestore.dart';
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

  Future<void> connectWithPairingCode(String code) async {
    await FirebaseAuth.instance.signInAnonymously();

    final query = await FirebaseFirestore.instance
        .collectionGroup('sheets')
        .where('pairingCode', isEqualTo: code)
        .limit(1)
        .get();

    if (query.docs.isEmpty) {
      await FirebaseAuth.instance.signOut();
      throw const PairingCodeNotFoundException();
    }

    final sheetDoc = query.docs.first;
    final sheetRef = sheetDoc.reference;
    final clubRef = sheetRef.parent.parent!;

    final clubDoc = await clubRef.get();
    final clubData = clubDoc.data() ?? <String, dynamic>{};
    final sheetData = sheetDoc.data();

    final uid = FirebaseAuth.instance.currentUser!.uid;

    await Future.wait([
      _prefs.setString(_clubIdKey, clubRef.id),
      _prefs.setString(_sheetIdKey, sheetRef.id),
      _prefs.setString(
        _clubNameKey,
        clubData['name'] as String? ?? '',
      ),
      _prefs.setString(
        _sheetNameKey,
        sheetData['name'] as String? ?? '',
      ),
    ]);

    await sheetRef.update({
      'scoreboardUid': uid,
      'pairingCode': FieldValue.delete(),
    });
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
  }
}

import 'package:curling_scoreboard/services/sync_service.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('SyncService.isPairingLostError', () {
    FirebaseException firestoreError(String code) =>
        FirebaseException(plugin: 'cloud_firestore', code: code);

    test('a refused write means the pairing is gone', () {
      expect(
        SyncService.isPairingLostError(firestoreError('permission-denied')),
        isTrue,
      );
      expect(
        SyncService.isPairingLostError(firestoreError('not-found')),
        isTrue,
      );
    });

    test('a connection problem does not', () {
      expect(
        SyncService.isPairingLostError(firestoreError('unavailable')),
        isFalse,
      );
      expect(SyncService.isPairingLostError(Exception('offline')), isFalse);
    });
  });
}

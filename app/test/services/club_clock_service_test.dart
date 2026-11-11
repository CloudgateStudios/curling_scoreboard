import 'dart:async';

import 'package:curling_scoreboard/services/club_clock_service.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _paired = <String, Object>{'clubId': 'club-a', 'sheetId': 'sheet-1'};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late List<String> watchedClubs;
  late StreamController<Map<String, dynamic>?> config;

  Stream<Map<String, dynamic>?> watch(String clubId) {
    watchedClubs.add(clubId);
    config = StreamController<Map<String, dynamic>?>();
    return config.stream;
  }

  Future<(ClubClockService, SharedPreferences)> build(
    Map<String, Object> stored,
  ) async {
    SharedPreferences.setMockInitialValues(stored);
    final prefs = await SharedPreferences.getInstance();
    final service = ClubClockService(
      prefs,
      RegistrationService(prefs),
      watch: watch,
    );
    addTearDown(service.dispose);
    return (service, prefs);
  }

  setUp(() => watchedClubs = []);

  test(
    'an unpaired scoreboard uses the 12 hour clock and watches nothing',
    () async {
      final (service, _) = await build({});
      service.start();

      expect(service.use24HourClock.value, isFalse);
      expect(watchedClubs, isEmpty);
    },
  );

  test('a paired scoreboard picks up and remembers its club clock', () async {
    final (service, prefs) = await build(_paired);
    service.start();
    expect(watchedClubs, ['club-a']);

    config.add({'timeZone': 'America/Chicago', 'clock': '24h'});
    await pumpEventQueue();
    expect(service.use24HourClock.value, isTrue);
    expect(prefs.getBool('clubClock24h'), isTrue);

    // The club goes back to the default.
    config.add({'timeZone': 'America/Chicago'});
    await pumpEventQueue();
    expect(service.use24HourClock.value, isFalse);
    expect(prefs.getBool('clubClock24h'), isFalse);
  });

  test('starts up offline on the clock it last saw', () async {
    final (service, _) = await build({..._paired, 'clubClock24h': true});
    expect(service.use24HourClock.value, isTrue);
  });

  test('forgets the clock once disconnected', () async {
    final (service, prefs) = await build({'clubClock24h': true});
    service.start();

    expect(service.use24HourClock.value, isFalse);
    expect(prefs.getBool('clubClock24h'), isNull);
  });

  test('keeps the clock it has and tries again after a refused read', () {
    fakeAsync((async) {
      late ClubClockService service;
      unawaited(
        build({
          ..._paired,
          'clubClock24h': true,
        }).then((built) => service = built.$1),
      );
      async.flushMicrotasks();

      service.start();
      config.addError(Exception('permission-denied'));
      async.flushMicrotasks();
      expect(service.use24HourClock.value, isTrue);
      expect(watchedClubs, ['club-a']);

      async.elapse(ClubClockService.retryDelay);
      expect(watchedClubs, ['club-a', 'club-a']);
    });
  });
}

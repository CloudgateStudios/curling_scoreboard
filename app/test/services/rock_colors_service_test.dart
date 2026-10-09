import 'dart:async';

import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:curling_scoreboard/services/rock_colors_service.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _paired = <String, Object>{'clubId': 'club-a', 'sheetId': 'sheet-1'};

const _blueGreen = RockColors(
  team1: RockColor(name: 'Blue', color: Color(0xFF2196F3)),
  team2: RockColor(name: 'Green', color: Color(0xFF4CAF50)),
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late List<String> watchedClubs;
  late StreamController<Map<String, dynamic>?> config;

  Stream<Map<String, dynamic>?> watch(String clubId) {
    watchedClubs.add(clubId);
    config = StreamController<Map<String, dynamic>?>();
    return config.stream;
  }

  Future<(RockColorsService, SharedPreferences)> build(
    Map<String, Object> stored,
  ) async {
    SharedPreferences.setMockInitialValues(stored);
    final prefs = await SharedPreferences.getInstance();
    final service = RockColorsService(
      prefs,
      RegistrationService(prefs),
      watch: watch,
    );
    addTearDown(service.dispose);
    return (service, prefs);
  }

  setUp(() => watchedClubs = []);

  test(
    'an unpaired scoreboard uses the defaults and watches nothing',
    () async {
      final (service, _) = await build({});
      service.start();

      expect(service.clubColors.value, isNull);
      expect(watchedClubs, isEmpty);
    },
  );

  test('a paired scoreboard picks up and remembers its club colors', () async {
    final (service, prefs) = await build(_paired);
    service.start();
    expect(watchedClubs, ['club-a']);
    expect(service.clubColors.value, isNull);

    config.add({'rockColors': _blueGreen.toJson()});
    await pumpEventQueue();

    expect(service.clubColors.value, _blueGreen);
    expect(prefs.getString('rockColors'), isNotNull);
  });

  test('remembered colors are used before the club is reached', () async {
    final (first, prefs) = await build(_paired);
    first.start();
    config.add({'rockColors': _blueGreen.toJson()});
    await pumpEventQueue();

    // The next start of the app, with no connection.
    final restarted = RockColorsService(
      prefs,
      RegistrationService(prefs),
      watch: watch,
    );
    addTearDown(restarted.dispose);
    expect(restarted.clubColors.value, _blueGreen);
  });

  test('a club with no colors set gets the defaults', () async {
    final (service, prefs) = await build(_paired);
    service.start();
    config.add({'rockColors': _blueGreen.toJson()});
    await pumpEventQueue();

    // The club goes back to red and yellow.
    config.add(null);
    await pumpEventQueue();

    expect(service.clubColors.value, isNull);
    expect(prefs.getString('rockColors'), isNull);
  });

  test('colors that cannot be read fall back to the defaults', () async {
    final (service, _) = await build(_paired);
    service.start();
    config.add({
      'rockColors': {
        'team1': {'name': 'Blue', 'hex': 'not a color'},
      },
    });
    await pumpEventQueue();

    expect(service.clubColors.value, isNull);
  });

  test('disconnecting goes back to the defaults', () async {
    final (service, prefs) = await build(_paired);
    service.start();
    config.add({'rockColors': _blueGreen.toJson()});
    await pumpEventQueue();

    // What RegistrationService.disconnect does to the saved pairing.
    await prefs.remove('clubId');
    await prefs.remove('sheetId');
    service.start();
    await pumpEventQueue();

    expect(service.clubColors.value, isNull);
    expect(prefs.getString('rockColors'), isNull);
  });

  test('a refused read keeps the remembered colors and is retried', () {
    fakeAsync((async) {
      late RockColorsService service;
      unawaited(build(_paired).then((built) => service = built.$1));
      async.flushMicrotasks();

      service.start();
      config.add({'rockColors': _blueGreen.toJson()});
      async.flushMicrotasks();

      config.addError(Exception('permission-denied'));
      async.flushMicrotasks();
      expect(service.clubColors.value, _blueGreen);
      expect(watchedClubs, hasLength(1));

      async.elapse(RockColorsService.retryDelay);
      expect(watchedClubs, hasLength(2));
    });
  });
}

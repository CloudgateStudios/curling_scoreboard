import 'dart:async';

import 'package:curling_scoreboard/main.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:curling_scoreboard/services/update_service.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../helpers/pump_app.dart';

class _Harness {
  _Harness(this.prefs, {this.hostedBuildId = 'build-1'});

  final SharedPreferences prefs;
  final remote = StreamController<String?>.broadcast();
  String? hostedBuildId;
  int reloads = 0;
  DateTime now = DateTime(2026, 9, 23, 12);

  late final service = UpdateService(
    currentBuildId: 'build-1',
    prefs: prefs,
    remoteBuildIds: () => remote.stream,
    fetchDeployedBuildId: () async => hostedBuildId,
    reloadPage: () => reloads++,
    clock: () => now,
  );
}

Future<_Harness> _harness({String? hostedBuildId = 'build-1'}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  return _Harness(prefs, hostedBuildId: hostedBuildId);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('UpdateService', () {
    test('no update while the deployed build matches', () async {
      final h = await _harness();
      h.service.start();
      await pumpEventQueue();

      expect(h.service.updateAvailable.value, isFalse);
      expect(h.service.reloadIfUpdateAvailable(), isFalse);
      expect(h.reloads, 0);
      h.service.dispose();
    });

    test('a new build from Firestore marks an update available', () async {
      final h = await _harness();
      h.service.start();
      h.remote.add('build-2');
      await pumpEventQueue();

      expect(h.service.updateAvailable.value, isTrue);
      expect(h.service.reloadIfUpdateAvailable(), isTrue);
      expect(h.reloads, 1);
      h.service.dispose();
    });

    test('checks build.json at 1 AM each day', () {
      fakeAsync((async) {
        late _Harness h;
        unawaited(_harness().then((value) => h = value));
        async.flushMicrotasks();
        // Timers run on fake time; the clock follows it from 6 PM.
        final start = DateTime(2026, 9, 23, 18);
        h.now = start;
        final service = UpdateService(
          currentBuildId: 'build-1',
          prefs: h.prefs,
          remoteBuildIds: () => h.remote.stream,
          fetchDeployedBuildId: () async => h.hostedBuildId,
          reloadPage: () => h.reloads++,
          clock: () => start.add(async.elapsed),
        )..start();
        async.flushMicrotasks();

        h.hostedBuildId = 'build-2';
        async.elapse(const Duration(hours: 6, minutes: 59));
        expect(service.updateAvailable.value, isFalse);

        async.elapse(const Duration(minutes: 1));
        expect(service.updateAvailable.value, isTrue);

        h.hostedBuildId = 'build-1';
        async.elapse(const Duration(hours: 24));
        expect(service.updateAvailable.value, isFalse);

        service.dispose();
      });
    });

    test('a new build.json is picked up by checkNow', () async {
      final h = await _harness();
      h.service.start();
      await pumpEventQueue();

      h.hostedBuildId = 'build-2';
      await h.service.checkNow();

      expect(h.service.updateAvailable.value, isTrue);
      h.service.dispose();
    });

    test('returning to the running build clears the update', () async {
      final h = await _harness();
      h.service.start();
      h.remote.add('build-2');
      await pumpEventQueue();
      h.remote.add('build-1');
      await pumpEventQueue();

      expect(h.service.updateAvailable.value, isFalse);
      h.service.dispose();
    });

    test('a missing build ID is ignored', () async {
      final h = await _harness(hostedBuildId: null);
      h.service.start();
      h.remote.add('build-2');
      await pumpEventQueue();
      h.remote.add(null);
      await pumpEventQueue();

      expect(h.service.updateAvailable.value, isTrue);
      h.service.dispose();
    });

    test('does not reload again for the same build right away', () async {
      final h = await _harness();
      h.service.start();
      h.remote.add('build-2');
      await pumpEventQueue();

      expect(h.service.reloadIfUpdateAvailable(), isTrue);

      // Simulate the reload coming back up on the old build.
      final afterReload = _Harness(h.prefs)..now = h.now;
      afterReload.service.start();
      afterReload.remote.add('build-2');
      await pumpEventQueue();

      expect(afterReload.service.reloadIfUpdateAvailable(), isFalse);

      afterReload.now = h.now.add(UpdateService.retryReloadAfter);
      expect(afterReload.service.reloadIfUpdateAvailable(), isTrue);
      expect(h.reloads + afterReload.reloads, 2);

      h.service.dispose();
      afterReload.service.dispose();
    });
  });

  group('daily check timing', () {
    test('later the same night when before 1 AM', () {
      expect(
        UpdateService.timeUntilNextDailyCheck(DateTime(2026, 9, 23, 0, 30)),
        const Duration(minutes: 30),
      );
    });

    test('the next night when at or after 1 AM', () {
      expect(
        UpdateService.timeUntilNextDailyCheck(DateTime(2026, 9, 23, 1)),
        const Duration(hours: 24),
      );
      expect(
        UpdateService.timeUntilNextDailyCheck(DateTime(2026, 9, 23, 18)),
        const Duration(hours: 7),
      );
    });

    test('rolls over the end of the month', () {
      final now = DateTime(2026, 9, 30, 12);
      expect(
        now.add(UpdateService.timeUntilNextDailyCheck(now)),
        DateTime(2026, 10, 1, 1),
      );
    });
  });

  group('scoreboard screen', () {
    Future<_Harness> pumpWithUpdates(WidgetTester tester) async {
      tester.view.physicalSize = scoreboardTestSurfaceSize;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      final h = await tester.runAsync(_harness);
      h!.service.start();

      await tester.pumpWidget(
        CurlingScoreboardApp(
          registrationService: RegistrationService(h.prefs),
          updateService: h.service,
        ),
      );
      await tester.pumpAndSettle();
      return h;
    }

    // The daily check timer has to be gone before the test ends, which is
    // before any tearDown runs.
    Future<void> disposeApp(WidgetTester tester, _Harness h) async {
      await tester.pumpWidget(const SizedBox());
      h.service.dispose();
    }

    testWidgets('reloads when an update arrives before a game starts', (
      tester,
    ) async {
      final h = await pumpWithUpdates(tester);

      h.remote.add('build-2');
      await tester.pumpAndSettle();

      expect(h.reloads, 1);
      await disposeApp(tester, h);
    });

    testWidgets('waits for the game to finish before reloading', (
      tester,
    ) async {
      final h = await pumpWithUpdates(tester);
      await tester.tap(find.text('Start Game'));
      await tester.pumpAndSettle();

      h.remote.add('build-2');
      await tester.pump();
      expect(h.reloads, 0);

      await tester.tap(find.byIcon(Icons.sports_score));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Yes'));
      await tester.pumpAndSettle();
      expect(h.reloads, 0);

      // Dismissing the game end dialog heads back to game start.
      await tester.tap(find.text('Dismiss'));
      await tester.pumpAndSettle();
      expect(h.reloads, 1);
      await disposeApp(tester, h);
    });
  });
}

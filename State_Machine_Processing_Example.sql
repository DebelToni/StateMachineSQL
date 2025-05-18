-- Добавяме повече стойности ---------------------------------------------------------
-- може да не работи ако в миналият файл са разбъркани сигналите и транзишионите
insert into sm.transition(signal_id, in_state_id, out_state_id)
values

  (
    (select id from sm.signal      where signal_name = 'finished work ok'),
    (select id from sm.state       where state_name  = 'start of service'),
    (select id from sm.state       where state_name  = 'end of service')
  ),

  (
    (select id from sm.signal      where signal_name = 'finished work failed'),
    (select id from sm.state       where state_name  = 'start of service'),
    (select id from sm.state       where state_name  = 'parts missing')
  ),

  (
    (select id from sm.signal      where signal_name = 'customer notification'),
    (select id from sm.state       where state_name  = 'end of service'),
    (select id from sm.state       where state_name  = 'reported')
  ),

  (
    (select id from sm.signal      where signal_name = 'time interval'),
    (select id from sm.state       where state_name  = 'parts missing'),
    (select id from sm.state       where state_name  = 'assigned')
  );

select sm.new_sm_unit(
  '{"MIF":"TestGadget","SN":"0000","Customer":"Test"}',
  'Test happy'
) as unit_id;

select sm.handle_signal(:unit_id, (select id from sm.signal where signal_name='customer call'),   '{"note":"hey"}');
select sm.handle_signal(:unit_id, (select id from sm.signal where signal_name='assign'),          '{"tech":"A"}');
select sm.handle_signal(:unit_id, (select id from sm.signal where signal_name='dispatch'),        '{}');
select sm.handle_signal(:unit_id, (select id from sm.signal where signal_name='arrive'),          '{}');
select sm.handle_signal(:unit_id, (select id from sm.signal where signal_name='finished work ok'),'{"ok":true}');
select sm.handle_signal(:unit_id, (select id from sm.signal where signal_name='customer notification'), '{}');

select * from sm.unit_status(:unit_id);

select sm.new_sm_unit('{"MIF":"LeakTest","SN":"0001","Customer":"LeakCo"}','Test parts');

select sm.handle_signal(:unit_id, (select id from sm.signal where signal_name='customer call'), '{}');
select sm.handle_signal(:unit_id, (select id from sm.signal where signal_name='assign'),        '{}');
select sm.handle_signal(:unit_id, (select id from sm.signal where signal_name='dispatch'),      '{}');
select sm.handle_signal(:unit_id, (select id from sm.signal where signal_name='arrive'),        '{}');

select sm.handle_signal(:unit_id, (select id from sm.signal where signal_name='parts missing'), '{}');
select sm.handle_signal(:unit_id, (select id from sm.signal where signal_name='time interval'),'{"warn":"too long"}');

select * from sm.unit_status(:unit_id);
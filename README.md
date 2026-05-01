# Onix Discord Bot

Каркас Discord-бота на JavaScript с slash-командами и интерфейсами на Components v2.

## Что внутри

- Основные команды: `/report`, `/помощь`, `/profile карточка`, `/profile настроить`, `/online`, `/avatar`, `/banner`
- Игры и ивенты: `/event создать`, `/event участвовать`, `/event список`, `/event топ`, `/event награда`, `/event статистика`, `/mafia статистика`, `/mafia топ`, `/mafia история`, `/close статистика`
- Топы: `/top баланс`, `/top онлайн`, `/top комнаты`, `/top любовь`, `/top уровень`, `/top рейтинг`, `/top участники`
- Экономика: `/balance`, `/timely`, `/give`, `/shop`, `/inventory`, `/transactions`, `/case инвентарь`, `/case открыть`, `/case история`
- Личные роли: `/role управление`, `/role инфо`, `/role создать`
- Кланы: `/clan профиль`, `/clan создать`, `/clan вступить`, `/clan онлайн`, `/clan выйти`, `/clan банк`, `/clan донат`, `/clan задания`, `/clan магазин`, `/clan улучшить`, `/clan рейтинг`, `/clan война`
- Маркет и аукционы: `/market список`, `/market продать`, `/market купить`, `/auction список`, `/auction создать`, `/auction ставка`
- Модерация: `/mod репорты`, `/mod варн`, `/mod история`, `/appeal`, `/ticket создать`
- Личные комнаты: `/room панель`, `/room лимит`, `/room название`, `/room кикнуть`, `/room передать`, `/room закрепить`
- Админ: `/admin диагностика`, `/admin backup`
- Музыка: `/play`, `/volume`, `/skip`, `/pause`, `/resume`, `/stop`, кнопки управления в карточке очереди
- Развлечения: `/coinflip` с необязательной ставкой, `/duel`, `/reaction`, `/snowball`

Все ответы отправляются через `MessageFlags.IsComponentsV2`, `ContainerBuilder`, `TextDisplayBuilder`, `MediaGalleryBuilder`, кнопки и селекты.

## Запуск

```bash
cd discord-js-components-bot
npm install
copy .env.example .env
```

Заполни `.env`:

- `DISCORD_TOKEN` - токен бота
- `DISCORD_CLIENT_ID` - Application ID
- `DISCORD_GUILD_ID` - ID сервера для быстрого деплоя команд
- `REPORT_CHANNEL_ID` - канал для копий жалоб, можно оставить пустым

Зарегистрировать slash-команды:

```bash
npm run deploy
```

Если указан `DISCORD_GUILD_ID`, деплой автоматически очищает глобальные команды приложения. Это убирает дубли в Discord, когда одни и те же команды случайно были зарегистрированы и глобально, и на сервере.

Запустить бота:

```bash
npm start
```

## Важно

Музыкальные команды сейчас работают как UI-контроллер очереди. Для настоящего воспроизведения подключи аудио-движок в `src/commands/music.js`, например Lavalink или отдельный player-пакет.

Данные хранятся в `data/database.json`: баланс, кейсы, статистика, личные роли, транзакции и голосовой онлайн.

Для временных голосовых комнат укажи в `.env`:

- `TEMP_ROOM_TRIGGER_CHANNEL_ID` - канал "Создать комнату"
- `TEMP_ROOM_CATEGORY_ID` - категория, куда создавать комнаты

Профиль 2.0 генерирует PNG-карточку через `sharp`, поэтому у бота есть отдельная зависимость для рендера изображений.

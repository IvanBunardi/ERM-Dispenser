#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// =====================================================
// WIFI CONFIG FOR WOKWI
// =====================================================

const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

// =====================================================
// MQTT CONFIG
// =====================================================

const char* MQTT_HOST = "mosquitto-aooww0g00oow0s4k40swgk8w.103.150.226.233.sslip.io";
const int MQTT_PORT = 1883;

const char* MQTT_USERNAME = "eaiymZLj6ROCRPOC";
const char* MQTT_PASSWORD = "slKpRaDUV7R0u4E8S58DvMXyhrKnLVio";

const char* MACHINE_ID = "VM-002";

// =====================================================
// MQTT TOPICS
// =====================================================

String TOPIC_COMMAND;
String TOPIC_STATUS;
String TOPIC_PROGRESS;
String TOPIC_EVENT;
String TOPIC_AVAILABILITY;

// =====================================================
// PIN CONFIG - sesuai diagram Wokwi saat ini
// =====================================================

#define BTN_QRIS_OK       19
#define BTN_BOTTLE        18
#define BTN_START         25
#define BTN_FINISH_FILL   27
#define BTN_CANCEL        23

#define PUMP_PIN          12
#define ONLINE_LED        13
#define FLOW_PIN          34
#define IR_PIN            35

#define OLED_SDA          21
#define OLED_SCL          22

// =====================================================
// OLED CONFIG
// =====================================================

#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
#define OLED_ADDRESS  0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// =====================================================
// SYSTEM CONFIG
// =====================================================

const int IR_THRESHOLD = 2000;

const unsigned long MQTT_RECONNECT_INTERVAL = 3000;
const unsigned long STATUS_PUBLISH_INTERVAL = 2000;
const unsigned long PROGRESS_PUBLISH_INTERVAL = 1000;
const unsigned long DISPLAY_UPDATE_INTERVAL = 300;
const unsigned long DEBOUNCE_DELAY = 50;
const unsigned long PAYMENT_TIMEOUT = 180000;
const unsigned long BOTTLE_TIMEOUT = 60000;
const unsigned long AUTO_FILL_DELAY_MIN = 2000;
const unsigned long AUTO_FILL_DELAY_MAX = 3000;
const unsigned long COMPLETE_SCREEN_TIME = 3000;

const float MIN_FLOW_LPM = 8.0;
const float MAX_FLOW_LPM = 60.0;
const float TANK_CAPACITY_LITERS = 19.0;

// =====================================================
// MQTT CLIENT
// =====================================================

WiFiClient espClient;
PubSubClient mqtt(espClient);

// =====================================================
// STATE MACHINE
// =====================================================

enum DeviceState {
  STATE_BOOT,
  STATE_IDLE,
  STATE_WAIT_PAYMENT,
  STATE_PAYMENT_SUCCESS,
  STATE_WAIT_BOTTLE,
  STATE_READY_TO_FILL,
  STATE_FILLING,
  STATE_COMPLETE,
  STATE_REFILL_COMPLETE,
  STATE_CANCELLED,
  STATE_ERROR
};

DeviceState currentState = STATE_BOOT;

// =====================================================
// GLOBAL VARIABLES
// =====================================================

String transactionId = "";
String refillId = "";
String source = "TABLET";
String lastError = "";

int targetVolumeMl = 0;
int amount = 0;

float targetVolumeLiters = 0.0;
float filledLiters = 0.0;
float flowRateLpm = 0.0;
float tankLiters = TANK_CAPACITY_LITERS;
float tankLevelPercent = 100.0;

bool pumpRunning = false;
bool paymentPaid = false;
bool bottleDetected = false;
bool simulatedBottlePresent = false;

unsigned long stateStartTime = 0;
unsigned long readySince = 0;
unsigned long autoFillDelay = 2500;
unsigned long lastMqttReconnect = 0;
unsigned long lastStatusPublish = 0;
unsigned long lastProgressPublish = 0;
unsigned long lastDisplayUpdate = 0;
unsigned long lastFlowUpdate = 0;

// =====================================================
// FORWARD DECLARATIONS
// =====================================================

void setupTopics();
void connectWiFi();
void ensureWiFi();
void connectMqtt();
void ensureMqtt();
void onMqttMessage(char* topic, byte* payload, unsigned int length);

void handleIdle();
void handleWaitPayment();
void handlePaymentSuccess();
void handleWaitBottle();
void handleReadyToFill();
void handleFilling();
void handleComplete();
void handleRefillComplete();
void handleCancelled();
void handleError();

void startOrder(int volumeMl, int price, String trxId, String orderSource);
void startFilling();
void completeFillingNow();
void refillTankFromAdmin(String newRefillId, float liters);
void stopPump();
void resetTransaction();
void updateFlowProgress();
void consumeTankLiters(float liters);
void publishStatusPeriodically();
void publishStatus();
void publishWaitPaymentStatus();
void publishProgress();
void publishEvent(String eventName);

void showStartupScreen();
void showIdleScreen();
void showPaymentScreen(unsigned long remaining);
void showBottleScreen();
void showReadyScreen();
void showFillingScreen();
void showCompleteScreen();
void showSimpleScreen(String title, String line);

bool isBottleDetected();
bool isButtonPressed(int pin);
void handleCancelButton();

void setState(DeviceState newState);
String getStateName(DeviceState state);
float mapFloat(float x, float inMin, float inMax, float outMin, float outMax);
void printFillingLog();
bool publishPayload(const String& topic, const char* payload, size_t length, bool retained = false);

// =====================================================
// SETUP
// =====================================================

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("=================================");
  Serial.println(" WATER VENDING IOT SIMULATION");
  Serial.println(" ESP32 + OLED + MQTT");
  Serial.println(" Diagram: no buzzer, admin refill");
  Serial.println("=================================");

  setupTopics();

  pinMode(BTN_QRIS_OK, INPUT_PULLUP);
  pinMode(BTN_BOTTLE, INPUT_PULLUP);
  pinMode(BTN_START, INPUT_PULLUP);
  pinMode(BTN_FINISH_FILL, INPUT_PULLUP);
  pinMode(BTN_CANCEL, INPUT_PULLUP);

  pinMode(PUMP_PIN, OUTPUT);
  pinMode(ONLINE_LED, OUTPUT);

  digitalWrite(PUMP_PIN, LOW);
  digitalWrite(ONLINE_LED, LOW);

  Wire.begin(OLED_SDA, OLED_SCL);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("SSD1306 OLED failed!");
    while (true) {
      delay(100);
    }
  }

  showStartupScreen();
  connectWiFi();

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setKeepAlive(30);
  mqtt.setSocketTimeout(10);
  mqtt.setBufferSize(1024);

  connectMqtt();
  setState(STATE_IDLE);
}

// =====================================================
// LOOP
// =====================================================

void loop() {
  ensureWiFi();
  ensureMqtt();

  if (mqtt.connected()) {
    mqtt.loop();
  }

  bottleDetected = isBottleDetected();
  handleCancelButton();

  switch (currentState) {
    case STATE_IDLE:
      handleIdle();
      break;
    case STATE_WAIT_PAYMENT:
      handleWaitPayment();
      break;
    case STATE_PAYMENT_SUCCESS:
      handlePaymentSuccess();
      break;
    case STATE_WAIT_BOTTLE:
      handleWaitBottle();
      break;
    case STATE_READY_TO_FILL:
      handleReadyToFill();
      break;
    case STATE_FILLING:
      handleFilling();
      break;
    case STATE_COMPLETE:
      handleComplete();
      break;
    case STATE_REFILL_COMPLETE:
      handleRefillComplete();
      break;
    case STATE_CANCELLED:
      handleCancelled();
      break;
    case STATE_ERROR:
      handleError();
      break;
    default:
      setState(STATE_IDLE);
      break;
  }

  publishStatusPeriodically();
  delay(20);
}

// =====================================================
// TOPICS
// =====================================================

void setupTopics() {
  String base = "vending/" + String(MACHINE_ID);

  TOPIC_COMMAND = base + "/command";
  TOPIC_STATUS = base + "/status";
  TOPIC_PROGRESS = base + "/progress";
  TOPIC_EVENT = base + "/event";
  TOPIC_AVAILABILITY = base + "/availability";
}

// =====================================================
// WIFI
// =====================================================

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  showSimpleScreen("WiFi", "Connecting...");
  Serial.print("Connecting WiFi");

  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 40) {
    delay(250);
    Serial.print(".");
    retry++;
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi connected!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());

    digitalWrite(ONLINE_LED, HIGH);
    showSimpleScreen("WiFi Connected", WiFi.localIP().toString());
    delay(1000);
  } else {
    Serial.println("WiFi failed!");
    digitalWrite(ONLINE_LED, LOW);
    showSimpleScreen("WiFi Failed", "Check config");
    delay(1000);
  }
}

void ensureWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    digitalWrite(ONLINE_LED, LOW);
    connectWiFi();
  }
}

// =====================================================
// MQTT
// =====================================================

void connectMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  String clientId = "esp32-" + String(MACHINE_ID) + "-" + String(random(0xffff), HEX);

  Serial.print("Connecting MQTT to ");
  Serial.print(MQTT_HOST);
  Serial.print(":");
  Serial.println(MQTT_PORT);

  bool connected = mqtt.connect(
    clientId.c_str(),
    MQTT_USERNAME,
    MQTT_PASSWORD,
    TOPIC_AVAILABILITY.c_str(),
    1,
    true,
    "offline"
  );

  if (connected) {
    Serial.println("MQTT connected!");

    mqtt.publish(TOPIC_AVAILABILITY.c_str(), "online", true);
    mqtt.subscribe(TOPIC_COMMAND.c_str(), 1);

    publishEvent("DEVICE_ONLINE");
    publishStatus();

    showSimpleScreen("MQTT Connected", MACHINE_ID);
    delay(700);
  } else {
    Serial.print("MQTT connect failed, rc=");
    Serial.println(mqtt.state());

    showSimpleScreen("MQTT Failed", "rc=" + String(mqtt.state()));
    delay(700);
  }
}

void ensureMqtt() {
  if (mqtt.connected()) {
    return;
  }

  if (millis() - lastMqttReconnect >= MQTT_RECONNECT_INTERVAL) {
    lastMqttReconnect = millis();
    connectMqtt();
  }
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String msg = "";

  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }

  Serial.println();
  Serial.print("MQTT message on ");
  Serial.println(topic);
  Serial.println(msg);

  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, msg);

  if (err) {
    Serial.print("Invalid MQTT JSON: ");
    Serial.println(err.c_str());
    publishEvent("INVALID_JSON");
    return;
  }

  String command = doc["command"] | "";

  if (command == "START_ORDER") {
    String trx = doc["transactionId"] | "";
    int volumeMl = doc["volumeMl"] | 0;
    int price = doc["amount"] | 0;

    if (trx.length() == 0 || volumeMl <= 0) {
      lastError = "Invalid order command";
      publishEvent("INVALID_COMMAND");
      return;
    }

    startOrder(volumeMl, price, trx, "TABLET");
  }

  else if (command == "PAYMENT_PAID") {
    String trx = doc["transactionId"] | "";

    if (trx == transactionId && currentState == STATE_WAIT_PAYMENT) {
      paymentPaid = true;
      publishEvent("PAYMENT_PAID_MQTT");
    }
  }

  else if (command == "CANCEL_ORDER") {
    String trx = doc["transactionId"] | "";

    if (trx.length() == 0 || trx == transactionId) {
      lastError = "Backend cancel";
      setState(STATE_CANCELLED);
    }
  }

  else if (command == "REFILL_TANK") {
    String incomingRefillId = doc["refillId"] | "";
    float liters = doc["tankLiters"] | TANK_CAPACITY_LITERS;

    if (incomingRefillId.length() == 0) {
      incomingRefillId = "ADMIN-REFILL-" + String(millis());
    }

    refillTankFromAdmin(incomingRefillId, liters);
  }

  else if (command == "SET_TANK_LEVEL") {
    float level = doc["levelPercent"] | tankLevelPercent;
    tankLevelPercent = constrain(level, 0.0, 100.0);
    tankLiters = (tankLevelPercent / 100.0) * TANK_CAPACITY_LITERS;
    publishEvent("TANK_LEVEL_UPDATED");
    publishStatus();
  }

  else if (command == "SYNC_STATUS" || command == "PING") {
    publishEvent(command == "PING" ? "PONG" : "STATUS_SYNCED");
    publishStatus();
  }
}

// =====================================================
// STATE HANDLERS
// =====================================================

void handleIdle() {
  showIdleScreen();
}

void handleWaitPayment() {
  unsigned long elapsed = millis() - stateStartTime;
  unsigned long remaining = 0;

  if (PAYMENT_TIMEOUT > elapsed) {
    remaining = (PAYMENT_TIMEOUT - elapsed) / 1000;
  }

  showPaymentScreen(remaining);

  if (isButtonPressed(BTN_QRIS_OK)) {
    paymentPaid = true;
    publishEvent("PAYMENT_CONFIRMED_BY_BUTTON");
  }

  if (paymentPaid) {
    setState(STATE_PAYMENT_SUCCESS);
    return;
  }

  if (elapsed >= PAYMENT_TIMEOUT) {
    lastError = "Payment timeout";
    setState(STATE_CANCELLED);
    return;
  }
}

void handlePaymentSuccess() {
  showSimpleScreen("Payment OK", "Place bottle");
  publishEvent("PAYMENT_SUCCESS");
  delay(1200);
  setState(STATE_WAIT_BOTTLE);
}

void handleWaitBottle() {
  unsigned long elapsed = millis() - stateStartTime;

  showBottleScreen();

  if (isButtonPressed(BTN_BOTTLE)) {
    simulatedBottlePresent = true;
    bottleDetected = true;
    publishEvent("BOTTLE_SIMULATED");
    setState(STATE_READY_TO_FILL);
    return;
  }

  if (isButtonPressed(BTN_START)) {
    simulatedBottlePresent = true;
    bottleDetected = true;
    publishEvent("BOTTLE_SENSOR_BYPASS_START");
    startFilling();
    return;
  }

  if (bottleDetected) {
    publishEvent("BOTTLE_DETECTED");
    setState(STATE_READY_TO_FILL);
    return;
  }

  if (elapsed >= BOTTLE_TIMEOUT) {
    lastError = "Bottle timeout";
    setState(STATE_CANCELLED);
    return;
  }
}

void handleReadyToFill() {
  showReadyScreen();

  if (!bottleDetected) {
    publishEvent("BOTTLE_REMOVED");
    setState(STATE_WAIT_BOTTLE);
    return;
  }

  if (isButtonPressed(BTN_START)) {
    publishEvent("START_BUTTON_MANUAL_FILL");
    startFilling();
    return;
  }

  if (millis() - readySince >= autoFillDelay) {
    publishEvent("AUTO_FILL_DELAY_DONE");
    startFilling();
  }
}

void handleFilling() {
  if (isButtonPressed(BTN_FINISH_FILL)) {
    publishEvent("FILLING_FORCE_COMPLETED");
    completeFillingNow();
    return;
  }

  if (!bottleDetected) {
    stopPump();
    lastError = "Bottle removed";
    publishEvent("BOTTLE_REMOVED_FILLING");
    setState(STATE_ERROR);
    return;
  }

  updateFlowProgress();

  if (millis() - lastDisplayUpdate >= DISPLAY_UPDATE_INTERVAL) {
    lastDisplayUpdate = millis();
    showFillingScreen();
  }

  if (millis() - lastProgressPublish >= PROGRESS_PUBLISH_INTERVAL) {
    lastProgressPublish = millis();
    publishProgress();
    printFillingLog();
  }

  if (filledLiters >= targetVolumeLiters) {
    completeFillingNow();
  }
}

void handleComplete() {
  showCompleteScreen();

  if (millis() - stateStartTime >= COMPLETE_SCREEN_TIME) {
    resetTransaction();
    setState(STATE_IDLE);
  }
}

void handleRefillComplete() {
  showSimpleScreen("TANK FULL", "19.0 L / 100%");

  if (millis() - stateStartTime >= COMPLETE_SCREEN_TIME) {
    refillId = "";
    source = "TABLET";
    setState(STATE_IDLE);
  }
}

void handleCancelled() {
  stopPump();
  showSimpleScreen("Cancelled", lastError);
  publishEvent("CANCELLED");
  delay(2500);
  resetTransaction();
  setState(STATE_IDLE);
}

void handleError() {
  stopPump();
  showSimpleScreen("ERROR", lastError);
  publishEvent("DEVICE_ERROR");
  delay(3000);
  resetTransaction();
  setState(STATE_IDLE);
}

// =====================================================
// ORDER / FILLING LOGIC
// =====================================================

void startOrder(int volumeMl, int price, String trxId, String orderSource) {
  transactionId = trxId;
  targetVolumeMl = volumeMl;
  targetVolumeLiters = volumeMl / 1000.0;
  amount = price;
  source = orderSource;

  filledLiters = 0.0;
  flowRateLpm = 0.0;
  paymentPaid = false;
  simulatedBottlePresent = false;
  lastError = "";

  setState(STATE_WAIT_PAYMENT);
  publishWaitPaymentStatus();
  publishEvent("ORDER_CREATED");
}

void startFilling() {
  if (targetVolumeLiters > tankLiters) {
    lastError = "Tank not enough";
    publishEvent("TANK_NOT_ENOUGH");
    setState(STATE_ERROR);
    return;
  }

  filledLiters = 0.0;
  flowRateLpm = 0.0;

  lastFlowUpdate = millis();
  lastProgressPublish = 0;

  pumpRunning = true;
  digitalWrite(PUMP_PIN, HIGH);

  publishEvent("FILLING_STARTED");
  setState(STATE_FILLING);
}

void completeFillingNow() {
  float remainingLiters = targetVolumeLiters - filledLiters;

  if (remainingLiters > 0.0) {
    consumeTankLiters(remainingLiters);
  }

  filledLiters = targetVolumeLiters;
  stopPump();

  publishProgress();
  publishEvent("FILLING_COMPLETE");
  publishStatus();

  setState(STATE_COMPLETE);
}

void refillTankFromAdmin(String newRefillId, float liters) {
  refillId = newRefillId;
  source = "ADMIN_DASHBOARD";
  tankLiters = constrain(liters, 0.0, TANK_CAPACITY_LITERS);
  tankLevelPercent = (tankLiters / TANK_CAPACITY_LITERS) * 100.0;
  filledLiters = 0.0;
  flowRateLpm = 0.0;
  lastError = "";

  stopPump();

  publishEvent("TANK_REFILL_COMPLETE");
  publishStatus();
  setState(STATE_REFILL_COMPLETE);
}

void stopPump() {
  pumpRunning = false;
  digitalWrite(PUMP_PIN, LOW);
}

void resetTransaction() {
  transactionId = "";
  refillId = "";
  source = "TABLET";
  lastError = "";

  targetVolumeMl = 0;
  targetVolumeLiters = 0.0;
  amount = 0;

  filledLiters = 0.0;
  flowRateLpm = 0.0;

  pumpRunning = false;
  paymentPaid = false;
  simulatedBottlePresent = false;

  digitalWrite(PUMP_PIN, LOW);
}

void consumeTankLiters(float liters) {
  if (liters <= 0.0) {
    return;
  }

  tankLiters -= liters;

  if (tankLiters < 0.0) {
    tankLiters = 0.0;
  }

  tankLevelPercent = (tankLiters / TANK_CAPACITY_LITERS) * 100.0;
}

void updateFlowProgress() {
  unsigned long now = millis();

  if (lastFlowUpdate == 0) {
    lastFlowUpdate = now;
    return;
  }

  unsigned long deltaMs = now - lastFlowUpdate;
  lastFlowUpdate = now;

  int flowValue = analogRead(FLOW_PIN);
  flowRateLpm = mapFloat(flowValue, 0, 4095, MIN_FLOW_LPM, MAX_FLOW_LPM);

  float litersPerMs = flowRateLpm / 60000.0;
  float litersAdded = litersPerMs * deltaMs;

  filledLiters += litersAdded;
  consumeTankLiters(litersAdded);

  if (filledLiters > targetVolumeLiters) {
    float overflowLiters = filledLiters - targetVolumeLiters;
    filledLiters = targetVolumeLiters;
    tankLiters = constrain(tankLiters + overflowLiters, 0.0, TANK_CAPACITY_LITERS);
    tankLevelPercent = (tankLiters / TANK_CAPACITY_LITERS) * 100.0;
  }
}

// =====================================================
// MQTT PUBLISH
// =====================================================

bool publishPayload(const String& topic, const char* payload, size_t length, bool retained) {
  if (!mqtt.connected()) {
    Serial.println("MQTT publish skipped: not connected");
    return false;
  }

  bool ok = mqtt.publish(topic.c_str(), (const uint8_t*)payload, length, retained);

  if (!ok) {
    Serial.print("MQTT publish failed to ");
    Serial.print(topic);
    Serial.print(" | state=");
    Serial.println(mqtt.state());
  }

  return ok;
}

void publishStatusPeriodically() {
  if (millis() - lastStatusPublish >= STATUS_PUBLISH_INTERVAL) {
    lastStatusPublish = millis();

    if (currentState == STATE_WAIT_PAYMENT) {
      publishWaitPaymentStatus();
    } else {
      publishStatus();
    }
  }
}

void publishStatus() {
  if (!mqtt.connected()) {
    return;
  }

  StaticJsonDocument<512> doc;

  doc["machineId"] = MACHINE_ID;
  doc["transactionId"] = transactionId;
  doc["refillId"] = refillId;
  doc["state"] = getStateName(currentState);
  doc["source"] = source;
  doc["targetVolumeMl"] = targetVolumeMl;
  doc["amount"] = amount;
  doc["bottleDetected"] = bottleDetected;
  doc["simulatedBottle"] = simulatedBottlePresent;
  doc["irValue"] = analogRead(IR_PIN);
  doc["pumpRunning"] = pumpRunning;
  doc["tankLiters"] = tankLiters;
  doc["tankCapacityLiters"] = TANK_CAPACITY_LITERS;
  doc["tankLevelPercent"] = tankLevelPercent;
  doc["filledMl"] = (int)(filledLiters * 1000.0);
  doc["flowRateLpm"] = flowRateLpm;
  doc["error"] = lastError;
  doc["uptimeMs"] = millis();

  char buffer[512];
  size_t n = serializeJson(doc, buffer);

  publishPayload(TOPIC_STATUS, buffer, n);
}

void publishWaitPaymentStatus() {
  if (!mqtt.connected()) {
    return;
  }

  StaticJsonDocument<512> doc;

  doc["machineId"] = MACHINE_ID;
  doc["transactionId"] = transactionId;
  doc["refillId"] = "";
  doc["state"] = "WAIT_PAYMENT";
  doc["source"] = source;
  doc["targetVolumeMl"] = targetVolumeMl;
  doc["amount"] = amount;
  doc["paymentPaid"] = paymentPaid;
  doc["bottleDetected"] = bottleDetected;
  doc["simulatedBottle"] = simulatedBottlePresent;
  doc["irValue"] = analogRead(IR_PIN);
  doc["pumpRunning"] = false;
  doc["tankLiters"] = tankLiters;
  doc["tankCapacityLiters"] = TANK_CAPACITY_LITERS;
  doc["tankLevelPercent"] = tankLevelPercent;
  doc["filledMl"] = 0;
  doc["flowRateLpm"] = 0.0;
  doc["error"] = lastError;
  doc["uptimeMs"] = millis();

  char buffer[512];
  size_t n = serializeJson(doc, buffer);

  publishPayload(TOPIC_STATUS, buffer, n);
}

void publishProgress() {
  if (!mqtt.connected()) {
    return;
  }

  int filledMl = (int)(filledLiters * 1000.0);
  int progress = 0;

  if (targetVolumeMl > 0) {
    progress = (filledMl * 100) / targetVolumeMl;
  }

  progress = constrain(progress, 0, 100);

  StaticJsonDocument<320> doc;

  doc["machineId"] = MACHINE_ID;
  doc["transactionId"] = transactionId;
  doc["state"] = getStateName(currentState);
  doc["source"] = source;
  doc["targetVolumeMl"] = targetVolumeMl;
  doc["filledMl"] = filledMl;
  doc["progressPercent"] = progress;
  doc["flowRateLpm"] = flowRateLpm;
  doc["pumpRunning"] = pumpRunning;
  doc["tankLiters"] = tankLiters;
  doc["tankLevelPercent"] = tankLevelPercent;

  char buffer[320];
  size_t n = serializeJson(doc, buffer);

  publishPayload(TOPIC_PROGRESS, buffer, n);
}

void publishEvent(String eventName) {
  if (!mqtt.connected()) {
    return;
  }

  StaticJsonDocument<320> doc;

  doc["machineId"] = MACHINE_ID;
  doc["transactionId"] = transactionId;
  doc["refillId"] = refillId;
  doc["event"] = eventName;
  doc["state"] = getStateName(currentState);
  doc["source"] = source;
  doc["tankLiters"] = tankLiters;
  doc["tankCapacityLiters"] = TANK_CAPACITY_LITERS;
  doc["tankLevelPercent"] = tankLevelPercent;
  doc["timestampMs"] = millis();

  char buffer[320];
  size_t n = serializeJson(doc, buffer);

  publishPayload(TOPIC_EVENT, buffer, n);
}

// =====================================================
// OLED UI
// =====================================================

void showStartupScreen() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.println("Water Vending IoT");

  display.setCursor(0, 16);
  display.println("MQTT + Dashboard");

  display.setCursor(0, 32);
  display.println("Tank 19 Liter");

  display.setCursor(0, 50);
  display.println("Booting...");

  display.display();
}

void showIdleScreen() {
  static unsigned long last = 0;

  if (millis() - last < 500) {
    return;
  }

  last = millis();

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.println("WATER VENDING");
  display.drawLine(0, 11, 127, 11, SSD1306_WHITE);

  display.setCursor(0, 16);
  display.print("Tank: ");
  display.print(tankLiters, 1);
  display.print("L ");
  display.print(tankLevelPercent, 0);
  display.println("%");

  display.setCursor(0, 32);
  display.println("Order dari tablet");

  display.setCursor(0, 46);
  display.println("Refill dari admin");

  display.setCursor(0, 56);
  display.print(mqtt.connected() ? "MQTT:ON " : "MQTT:OFF");
  display.print(WiFi.status() == WL_CONNECTED ? "WiFi:ON" : "WiFi:OFF");

  display.display();
}

void showPaymentScreen(unsigned long remaining) {
  static unsigned long last = 0;

  if (millis() - last < 300) {
    return;
  }

  last = millis();

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.println("QRIS PAYMENT");
  display.drawLine(0, 11, 127, 11, SSD1306_WHITE);

  display.setCursor(0, 17);
  display.print("Vol: ");
  display.print(targetVolumeMl);
  display.println(" ml");

  display.setCursor(0, 29);
  display.print("Rp ");
  display.println(amount);

  display.setCursor(0, 41);
  display.println("Press QRIS OK");

  display.setCursor(0, 54);
  display.print("Timeout: ");
  display.print(remaining);
  display.print("s");

  display.display();
}

void showBottleScreen() {
  static unsigned long last = 0;

  if (millis() - last < 300) {
    return;
  }

  last = millis();

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.println("WAIT BOTTLE");
  display.drawLine(0, 11, 127, 11, SSD1306_WHITE);

  display.setCursor(0, 18);
  display.println("BOTTLE = detect");

  display.setCursor(0, 32);
  display.println("START = bypass");

  display.setCursor(0, 46);
  display.print("IR: ");
  display.println(analogRead(IR_PIN));

  display.display();
}

void showReadyScreen() {
  static unsigned long last = 0;

  if (millis() - last < 300) {
    return;
  }

  last = millis();

  unsigned long elapsed = millis() - readySince;
  unsigned long remaining = autoFillDelay > elapsed ? (autoFillDelay - elapsed + 999) / 1000 : 0;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.println("BOTTLE READY");
  display.drawLine(0, 11, 127, 11, SSD1306_WHITE);

  display.setCursor(0, 18);
  display.print("Target: ");
  display.print(targetVolumeMl);
  display.println(" ml");

  display.setCursor(0, 34);
  display.print("Auto fill: ");
  display.print(remaining);
  display.println("s");

  display.setCursor(0, 50);
  display.println("START = now");

  display.display();
}

void showFillingScreen() {
  int filledMl = (int)(filledLiters * 1000.0);
  int progress = 0;

  if (targetVolumeMl > 0) {
    progress = (filledMl * 100) / targetVolumeMl;
  }

  progress = constrain(progress, 0, 100);

  int barWidth = map(progress, 0, 100, 0, 124);

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.println("FILLING WATER");
  display.drawLine(0, 11, 127, 11, SSD1306_WHITE);

  display.setCursor(0, 17);
  display.print(filledMl);
  display.print("/");
  display.print(targetVolumeMl);
  display.println(" ml");

  display.setCursor(0, 29);
  display.print("Tank: ");
  display.print(tankLiters, 1);
  display.println(" L");

  display.drawRect(0, 43, 128, 12, SSD1306_WHITE);
  display.fillRect(2, 45, barWidth, 8, SSD1306_WHITE);

  display.setCursor(0, 56);
  display.print("FINISH");
  display.setCursor(92, 56);
  display.print(progress);
  display.println("%");

  display.display();
}

void showCompleteScreen() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.println("COMPLETE");
  display.drawLine(0, 12, 127, 12, SSD1306_WHITE);

  display.setCursor(0, 24);
  display.print("Filled: ");
  display.print((int)(filledLiters * 1000.0));
  display.println(" ml");

  display.setCursor(0, 42);
  display.print("Tank: ");
  display.print(tankLiters, 1);
  display.println(" L");

  display.display();
}

void showSimpleScreen(String title, String line) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.println(title);
  display.drawLine(0, 12, 127, 12, SSD1306_WHITE);

  display.setCursor(0, 28);
  display.println(line);

  display.display();
}

// =====================================================
// SENSOR & BUTTON
// =====================================================

bool isBottleDetected() {
  int ir = analogRead(IR_PIN);
  return simulatedBottlePresent || (ir > IR_THRESHOLD);
}

bool isButtonPressed(int pin) {
  if (digitalRead(pin) == LOW) {
    delay(DEBOUNCE_DELAY);

    if (digitalRead(pin) == LOW) {
      while (digitalRead(pin) == LOW) {
        delay(10);
      }

      delay(DEBOUNCE_DELAY);
      return true;
    }
  }

  return false;
}

void handleCancelButton() {
  if (
    currentState == STATE_IDLE ||
    currentState == STATE_COMPLETE ||
    currentState == STATE_REFILL_COMPLETE ||
    currentState == STATE_CANCELLED ||
    currentState == STATE_ERROR
  ) {
    return;
  }

  if (isButtonPressed(BTN_CANCEL)) {
    lastError = "Manual cancel";
    publishEvent("CANCEL_BUTTON");
    setState(STATE_CANCELLED);
  }
}

// =====================================================
// HELPERS
// =====================================================

void setState(DeviceState newState) {
  currentState = newState;
  stateStartTime = millis();

  if (newState == STATE_READY_TO_FILL) {
    readySince = millis();
    autoFillDelay = random(AUTO_FILL_DELAY_MIN, AUTO_FILL_DELAY_MAX + 1);
  }

  Serial.print("STATE: ");
  Serial.println(getStateName(newState));

  publishStatus();
}

String getStateName(DeviceState state) {
  switch (state) {
    case STATE_BOOT:
      return "BOOT";
    case STATE_IDLE:
      return "IDLE";
    case STATE_WAIT_PAYMENT:
      return "WAIT_PAYMENT";
    case STATE_PAYMENT_SUCCESS:
      return "PAYMENT_SUCCESS";
    case STATE_WAIT_BOTTLE:
      return "WAIT_BOTTLE";
    case STATE_READY_TO_FILL:
      return "READY_TO_FILL";
    case STATE_FILLING:
      return "FILLING";
    case STATE_COMPLETE:
      return "COMPLETE";
    case STATE_REFILL_COMPLETE:
      return "REFILL_COMPLETE";
    case STATE_CANCELLED:
      return "CANCELLED";
    case STATE_ERROR:
      return "ERROR";
    default:
      return "UNKNOWN";
  }
}

float mapFloat(float x, float inMin, float inMax, float outMin, float outMax) {
  return (x - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
}

void printFillingLog() {
  Serial.print("Filled: ");
  Serial.print((int)(filledLiters * 1000.0));
  Serial.print("/");
  Serial.print(targetVolumeMl);
  Serial.print(" ml | Tank: ");
  Serial.print(tankLiters, 2);
  Serial.print(" L | Flow: ");
  Serial.print(flowRateLpm, 1);
  Serial.println(" L/min");
}

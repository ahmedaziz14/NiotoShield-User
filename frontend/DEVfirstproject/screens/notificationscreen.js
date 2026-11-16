import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Image,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import io from "socket.io-client";
import * as Animatable from "react-native-animatable";
import { Audio } from "expo-av";
import LottieView from "lottie-react-native";

const NotificationsScreen = () => {
  const [notifications, setNotifications] = useState([]);
  const [token, setToken] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);

  const decodeTokenManually = (token) => {
    try {
      const base64Url = token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.log("❌ Erreur de décodage manuel :", error);
      return {};
    }
  };

  const playNotificationSound = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require("../assets/notification.mp3")
      );
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) sound.unloadAsync();
      });
    } catch (error) {
      console.log("❌ Erreur lors de la lecture du son :", error);
    }
  };

  useEffect(() => {
    const getTokenAndUserId = async () => {
      try {
        const storedToken = await AsyncStorage.getItem("token");
        if (storedToken) {
          setToken(storedToken);
          const decodedToken = decodeTokenManually(storedToken);
          const decodedUserId = decodedToken.id || decodedToken.userId || decodedToken.sub;
          setUserId(decodedUserId);
        }
      } catch (error) {
        console.log("❌ Erreur lors de la récupération :", error);
      }
    };
    getTokenAndUserId();
  }, []);

  const fetchNotifications = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch("http://192.168.248.139:3000/notifications", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (response.ok) {
        if (result.notifications.length > notifications.length) {
          playNotificationSound();
        }
        setNotifications(result.notifications || []);
      }
    } catch (error) {
      console.log("❌ Échec du rechargement :", error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId) => {
    if (!token) return;
    try {
      const response = await fetch(
        `http://192.168.248.139:3000/notifications/${notificationId}/read`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (response.ok) {
        setNotifications((prev) =>
          prev.map((notif) =>
            notif.id === notificationId ? { ...notif, is_read: true } : notif
          )
        );
      }
    } catch (error) {
      console.log("❌ Échec du marquage :", error);
    }
  };

  const deleteNotification = async (notificationId) => {
    if (!token) return;
    try {
      const response = await fetch(
        `http://192.168.248.139:3000/notifications/${notificationId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (response.ok) {
        setNotifications((prev) =>
          prev.filter((notif) => notif.id !== notificationId)
        );
      }
    } catch (error) {
      console.log("❌ Échec de la suppression :", error);
    }
  };

  const deleteAllNotification = async () => {
  if (!token) return;
  try {
    const response = await fetch(
      `http://192.168.248.139:3000/notifications/`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );
    if (response.ok) {
      setNotifications([]); 
    }
  } catch (error) {
    console.log("❌ Échec de la suppression :", error);
  }
};

  useEffect(() => {
    if (token && userId) {
      fetchNotifications();
      const socket = io("http://192.168.248.139:3000", {
        auth: { token: token },
      });

      socket.on("connect", () => {
        socket.emit("join", userId);
      });

      socket.on("new-notification", (notification) => {
        setNotifications((prev) => [notification, ...prev]);
        playNotificationSound();
      });

      socket.on("notification-marked-as-read", (notificationId) => {
        setNotifications((prev) =>
          prev.map((notif) =>
            String(notif.id) === String(notificationId)
              ? { ...notif, is_read: true }
              : notif
          )
        );
      });

      socket.on("notification-deleted", (notificationId) => {
        setNotifications((prev) =>
          prev.filter((notif) => notif.id !== notificationId)
        );
      });

      return () => {
        socket.disconnect();
      };
    }
  }, [token, userId]);

  const handleNotificationPress = (notification) => {
    if (notification.message?.includes("[ALERT] Security Alert: Unrecognized person detected") || 
        notification.message?.includes("[ALERT] Security Alert: Possible spoofing attempt detected")) {
      setSelectedNotification(notification);
      setModalVisible(true);
    }
  };

  const handleViewImage = () => {
    setModalVisible(false);
    setImageModalVisible(true);
  };

  return (
    <View style={styles.container}>
      <LottieView
        source={require("./img/spacex.json")}
        autoPlay
        loop
        style={styles.background}
      />
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Notifications</Text>
          <View style={styles.headerButtons}>
    <TouchableOpacity
      onPress={deleteAllNotification}
      style={[styles.deleteAllButton, notifications.length === 0 && styles.disabledButton]}
      disabled={notifications.length === 0}
    >
      <Text style={styles.deleteAllText}>Tout supprimer</Text>
    </TouchableOpacity>
          <TouchableOpacity
            onPress={fetchNotifications}
            style={[styles.reloadButton, loading && styles.reloadButtonDisabled]}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.reloadText}>Recharger</Text>
            )}
          </TouchableOpacity>
          </View>
        </View>
        {notifications.length === 0 && !loading ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Aucune notification</Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <Animatable.View
                animation="fadeInUp"
                duration={500}
                style={[
                  styles.notificationItem,
                  item.is_read ? styles.read : styles.unread,
                  item.message?.includes("[ALERT] Security Alert:") && styles.securityAlertItem
                ]}
              >
                <TouchableOpacity onPress={() => handleNotificationPress(item)}>
                  <Text style={[
                    styles.notificationText,
                    item.message?.includes("[ALERT] Security Alert:") && styles.securityAlertText
                  ]}>
                    {item.message || "Sans message"}
                  </Text>
                </TouchableOpacity>
                <View style={styles.actions}>
                  {!item.is_read && (
                    <TouchableOpacity
                      onPress={() => markAsRead(item.id)}
                      style={styles.button}
                    >
                      <Text style={styles.buttonText}>✔ Lire</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => deleteNotification(item.id)}
                    style={[styles.button, styles.deleteButton]}
                  >
                    <Text style={styles.buttonText}>❌ Supprimer</Text>
                  </TouchableOpacity>
                </View>
              </Animatable.View>
            )}
          />
        )}
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={[
            styles.modalContent,
            selectedNotification?.message?.includes("[ALERT] Security Alert:") && styles.alertModalContent
          ]}>
            <ScrollView>
              <Text style={styles.modalTitle}>
                {selectedNotification?.message?.includes("[ALERT] Security Alert:") 
                  ? "⚠️ ALERTE DE SÉCURITÉ ⚠️" 
                  : "Détails de la notification"}
              </Text>
              
              {selectedNotification && (
                <>
                  {selectedNotification.image_url && (
                    <>
                      <Image
                        source={{ uri: selectedNotification.image_url }}
                        style={styles.modalImage}
                      />
                      <Text style={styles.alertText}>
                        Appuyez ci-dessous pour voir l'image détectée
                      </Text>
                    </>
                  )}
                  
                  <Text style={styles.modalText}>
                    Statut: {selectedNotification.is_read ? "Lu" : "Non lu"}
                  </Text>
                  <Text style={styles.modalText}>
                    Date: {new Date(selectedNotification.created_at).toLocaleString()}
                  </Text>
                  <Text style={styles.modalText}>
                    Message: {selectedNotification.message}
                  </Text>
                  
                  {selectedNotification.image_url && (
                    <TouchableOpacity
                      style={styles.viewImageButton}
                      onPress={handleViewImage}
                    >
                      <Text style={styles.viewImageButtonText}>VOIR L'IMAGE</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
              
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.closeButtonText}>Fermer</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent={true}
        visible={imageModalVisible}
        onRequestClose={() => setImageModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.imageModalContent}>
            {selectedNotification?.image_url && (
              <Image
                source={{ uri: selectedNotification.image_url }}
                style={styles.fullImage}
              />
            )}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setImageModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d1117",
  },
  background: {
    position: "absolute",
    width: "100%",
    height: "100%",
    zIndex: 0,
  },
  content: {
    flex: 1,
    padding: 20,
    zIndex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#ffffff",
  },
  reloadButton: {
    backgroundColor: "#1f6feb",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    shadowColor: "#1f6feb",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  reloadButtonDisabled: {
    backgroundColor: "#567edc",
  },
  reloadText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  notificationItem: {
    backgroundColor: "#161b22",
    padding: 15,
    marginBottom: 15,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  securityAlertItem: {
    backgroundColor: "#3a0a0a",
    borderLeftColor: "#ff0000",
  },
  unread: {
    borderLeftWidth: 4,
    borderLeftColor: "#58a6ff",
  },
  read: {
    borderLeftWidth: 4,
    borderLeftColor: "#30363d",
  },
  notificationText: {
    color: "#c9d1d9",
    fontSize: 16,
    fontWeight: "500",
  },
  securityAlertText: {
    color: "#ff9999",
    fontWeight: "bold",
  },
  actions: {
    flexDirection: "row",
    marginTop: 12,
    justifyContent: "flex-end",
  },
  button: {
    backgroundColor: "#238636",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginLeft: 8,
  },
  deleteButton: {
    backgroundColor: "#da3633",
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 18,
    color: "#8b949e",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: "#1c2526",
    borderRadius: 20,
    padding: 20,
    width: "90%",
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  alertModalContent: {
    backgroundColor: '#ff4444',
    borderWidth: 2,
    borderColor: '#ff0000',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 20,
    textAlign: "center",
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: -1, height: 1},
    textShadowRadius: 10,
  },
  modalImage: {
    width: 150,
    height: 150,
    alignSelf: "center",
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#58a6ff",
  },
  modalText: {
    fontSize: 16,
    color: "#c9d1d9",
    marginBottom: 10,
  },
  alertText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 10,
    borderRadius: 8,
  },
  viewImageButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignSelf: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#000000',
  },
  viewImageButtonText: {
    color: '#ff0000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeButton: {
    backgroundColor: "#1f6feb",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignSelf: "center",
    marginTop: 20,
  },
  closeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  imageModalContent: {
    backgroundColor: "#1c2526",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  fullImage: {
    width: 250,
    height: 250,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#58a6ff",
  },
  headerButtons: {
  flexDirection: 'row',
  gap: 10,
},
deleteAllButton: {
  backgroundColor: "#da3633",
  paddingVertical: 10,
  paddingHorizontal: 14,
  borderRadius: 12,
  shadowColor: "#da3633",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.4,
  shadowRadius: 4,
  elevation: 5,
},
deleteAllText: {
  color: "#fff",
  fontSize: 14,
  fontWeight: "600",
},
disabledButton: {
  opacity: 0.5,
},
});

export default NotificationsScreen;
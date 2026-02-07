import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { openURL } from "expo-linking";

import { Colors, BorderRadius, FontSizes, Spacing } from "@/constants/theme";
import { clearAllData, getAllTransactions } from "@/services/storage";
import { exportToPDF } from "@/services/pdf-export";
import { getCategories } from "@/services/category-storage";
import { useTheme } from "@/contexts/theme-context";
import { useSecurity } from "@/contexts/security-context";
import { setBudget, getBudget } from "@/services/storage";

type ThemeMode = "light" | "dark" | "system";

export default function SettingsScreen() {
  const { colorScheme, themeMode, setThemeMode } = useTheme();
  const { isBioLockEnabled, setBioLockEnabled, isPrivacyModeEnabled, setPrivacyModeEnabled, hasHardware } = useSecurity();
  const colors = Colors[colorScheme ?? "dark"];
  const insets = useSafeAreaInsets();

  const [transactionCount, setTransactionCount] = useState(0);
  const [categoryCount, setCategoryCount] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [isSavingBudget, setIsSavingBudget] = useState(false);

  const handleThemeChange = async (mode: ThemeMode) => {
    await setThemeMode(mode);
  };

  const loadStats = useCallback(async () => {
    try {
      const [transactions, categories, currentBudget] = await Promise.all([
        getAllTransactions(),
        getCategories(),
        getBudget(),
      ]);
      setTransactionCount(transactions.length);
      setCategoryCount(categories.length);
      if (currentBudget) setBudgetInput(currentBudget.toString());
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  const handleClearData = () => {
    if (transactionCount === 0) {
      Alert.alert("No Data", "There is no data to clear.");
      return;
    }

    Alert.alert(
      "Clear All Data",
      `This will permanently delete all ${transactionCount} transaction${transactionCount !== 1 ? "s" : ""
      }. This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            const success = await clearAllData();
            if (success) {
              setTransactionCount(0);
              Alert.alert("Success", "All data has been cleared.");
            } else {
              Alert.alert("Error", "Failed to clear data. Please try again.");
            }
          },
        },
      ]
    );
  };

  const handleExportAll = async () => {
    if (transactionCount === 0) {
      Alert.alert("No Data", "There are no transactions to export.");
      return;
    }

    setIsExporting(true);
    try {
      await exportToPDF();
    } catch (error) {
      console.error("Export error:", error);
      Alert.alert("Error", "Failed to export data. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveBudget = async () => {
    const amount = parseFloat(budgetInput);
    if (isNaN(amount) || amount < 0) {
      Alert.alert("Invalid Amount", "Please enter a valid budget amount.");
      return;
    }

    setIsSavingBudget(true);
    try {
      const success = await setBudget(amount);
      if (success) {
        Alert.alert("Success", "Monthly budget updated successfully.");
      } else {
        Alert.alert("Error", "Failed to save budget.");
      }
    } catch (error) {
      console.error("Save budget error:", error);
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setIsSavingBudget(false);
    }
  };

  const appVersion = Constants.expoConfig?.version || "1.0.0";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>

        {/* Privacy Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            PRIVACY
          </Text>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            {/* Privacy Dashboard */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => router.push('/privacy-dashboard')}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: colors.surface }]}>
                  <Ionicons name="shield-checkmark" size={20} color={colors.tint} />
                </View>
                <View style={styles.menuItemText}>
                  <Text style={[styles.menuItemLabel, { color: colors.text }]}>
                    Privacy Dashboard
                  </Text>
                  <Text style={[styles.menuItemDescription, { color: colors.textSecondary }]}>
                    See what we store & control your data
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Security Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            SECURITY & PRIVACY
          </Text>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            {/* Biometric Lock */}
            {hasHardware && (
              <>
                <View style={styles.menuItem}>
                  <View style={styles.menuItemLeft}>
                    <View style={[styles.iconContainer, { backgroundColor: colors.surface }]}>
                      <Ionicons name="finger-print" size={20} color={colors.tint} />
                    </View>
                    <View style={styles.menuItemText}>
                      <Text style={[styles.menuItemLabel, { color: colors.text }]}>
                        Biometric Lock
                      </Text>
                      <Text style={[styles.menuItemDescription, { color: colors.textSecondary }]}>
                        Require authentication to open app
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setBioLockEnabled(!isBioLockEnabled)}
                    style={[styles.toggleWrap, { backgroundColor: isBioLockEnabled ? colors.tint : colors.surface }]}
                  >
                    <View style={[styles.toggleHandle, { marginLeft: isBioLockEnabled ? 22 : 2 }]} />
                  </TouchableOpacity>
                </View>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              </>
            )}

            {/* Privacy Mode */}
            <View style={styles.menuItem}>
              <View style={styles.menuItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: colors.surface }]}>
                  <Ionicons name="eye-off-outline" size={20} color={colors.tint} />
                </View>
                <View style={styles.menuItemText}>
                  <Text style={[styles.menuItemLabel, { color: colors.text }]}>
                    Privacy Mode
                  </Text>
                  <Text style={[styles.menuItemDescription, { color: colors.textSecondary }]}>
                    Mask amounts on home screen
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setPrivacyModeEnabled(!isPrivacyModeEnabled)}
                style={[styles.toggleWrap, { backgroundColor: isPrivacyModeEnabled ? colors.tint : colors.surface }]}
              >
                <View style={[styles.toggleHandle, { marginLeft: isPrivacyModeEnabled ? 22 : 2 }]} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Budget Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            BUDGETING
          </Text>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={styles.budgetSetting}>
              <View style={styles.budgetInputRow}>
                <View style={[styles.iconContainer, { backgroundColor: colors.surface }]}>
                  <Ionicons name="wallet-outline" size={20} color={colors.tint} />
                </View>
                <View style={styles.inputWrap}>
                  <Text style={[styles.menuItemLabel, { color: colors.text }]}>
                    Monthly Limit
                  </Text>
                  <TextInput
                    style={[styles.budgetInput, { color: colors.text, borderBottomColor: colors.border }]}
                    value={budgetInput}
                    onChangeText={setBudgetInput}
                    placeholder="Enter limit (e.g. 15000)"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <TouchableOpacity
                style={[styles.saveBudgetButton, { backgroundColor: colors.tint, opacity: isSavingBudget ? 0.7 : 1 }]}
                onPress={handleSaveBudget}
                disabled={isSavingBudget}
              >
                <Text style={styles.saveBudgetText}>
                  {isSavingBudget ? "Saving..." : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Categories Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            CATEGORIES
          </Text>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => router.push("/category-manager")}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: colors.surface }]}>
                  <Ionicons name="pricetags-outline" size={20} color={colors.tint} />
                </View>
                <View style={styles.menuItemText}>
                  <Text style={[styles.menuItemLabel, { color: colors.text }]}>
                    Manage Categories
                  </Text>
                  <Text style={[styles.menuItemDescription, { color: colors.textSecondary }]}>
                    {categoryCount} categor{categoryCount !== 1 ? "ies" : "y"} configured
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Data Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            DATA
          </Text>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            {/* Export PDF */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleExportAll}
              disabled={isExporting}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: colors.surface }]}>
                  <Ionicons name="download-outline" size={20} color={colors.tint} />
                </View>
                <View style={styles.menuItemText}>
                  <Text style={[styles.menuItemLabel, { color: colors.text }]}>
                    {isExporting ? "Exporting..." : "Export Transactions"}
                  </Text>
                  <Text style={[styles.menuItemDescription, { color: colors.textSecondary }]}>
                    Get PDF report of all transactions
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Clear Data */}
            <TouchableOpacity style={styles.menuItem} onPress={handleClearData}>
              <View style={styles.menuItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: `${colors.error}20` }]}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </View>
                <View style={styles.menuItemText}>
                  <Text style={[styles.menuItemLabel, { color: colors.error }]}>
                    Clear All Data
                  </Text>
                  <Text style={[styles.menuItemDescription, { color: colors.textSecondary }]}>
                    {transactionCount} transaction{transactionCount !== 1 ? "s" : ""} stored
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Appearance Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            APPEARANCE
          </Text>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={styles.themeSelector}>
              <TouchableOpacity
                style={[
                  styles.themeOption,
                  {
                    backgroundColor: themeMode === "light" ? colors.tint : "transparent",
                    borderColor: themeMode === "light" ? colors.tint : colors.border,
                  },
                ]}
                onPress={() => handleThemeChange("light")}
              >
                <Ionicons
                  name="sunny"
                  size={20}
                  color={themeMode === "light" ? "#fff" : colors.textSecondary}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.themeOption,
                  {
                    backgroundColor: themeMode === "dark" ? colors.tint : "transparent",
                    borderColor: themeMode === "dark" ? colors.tint : colors.border,
                  },
                ]}
                onPress={() => handleThemeChange("dark")}
              >
                <Ionicons
                  name="moon"
                  size={20}
                  color={themeMode === "dark" ? "#fff" : colors.textSecondary}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.themeOption,
                  {
                    backgroundColor: themeMode === "system" ? colors.tint : "transparent",
                    borderColor: themeMode === "system" ? colors.tint : colors.border,
                  },
                ]}
                onPress={() => handleThemeChange("system")}
              >
                <Ionicons
                  name="phone-portrait"
                  size={20}
                  color={themeMode === "system" ? "#fff" : colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            ABOUT
          </Text>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={styles.aboutItem}>
              <Text style={[styles.aboutLabel, { color: colors.text }]}>
                App Version
              </Text>
              <Text style={[styles.aboutValue, { color: colors.textSecondary }]}>
                {appVersion}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.aboutItem}>
              <Text style={[styles.aboutLabel, { color: colors.text }]}>
                Privacy
              </Text>
              <Text style={[styles.aboutValue, { color: colors.textSecondary }]}>
                All data stored locally
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Privacy Policy Link */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                openURL('https://github.com/Ujjwaljain16/ExpenseTracker/blob/main/PRIVACY.md');
              }}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: colors.surface }]}>
                  <Ionicons name="document-text-outline" size={20} color={colors.tint} />
                </View>
                <View style={styles.menuItemText}>
                  <Text style={[styles.menuItemLabel, { color: colors.text }]}>
                    Privacy Policy
                  </Text>
                  <Text style={[styles.menuItemDescription, { color: colors.textSecondary }]}>
                    Read our privacy commitment
                  </Text>
                </View>
              </View>
              <Ionicons name="open-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  title: {
    fontSize: FontSizes.xxl,
    fontWeight: "700",
    marginBottom: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  card: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  themeSelector: {
    flexDirection: "row",
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  themeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  menuItemText: {
    flex: 1,
  },
  menuItemLabel: {
    fontSize: FontSizes.md,
    fontWeight: "500",
    marginBottom: 2,
  },
  menuItemDescription: {
    fontSize: FontSizes.sm,
  },
  divider: {
    height: 1,
  },
  aboutItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.md,
  },
  aboutLabel: {
    fontSize: FontSizes.md,
  },
  aboutValue: {
    fontSize: FontSizes.md,
  },
  toggleWrap: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleHandle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF',
  },
  budgetSetting: {
    padding: Spacing.md,
  },
  budgetInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  inputWrap: {
    flex: 1,
  },
  budgetInput: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
  },
  saveBudgetButton: {
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  saveBudgetText: {
    color: '#FFF',
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
});
